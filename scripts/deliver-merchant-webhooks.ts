import { db } from '@paymorph/db';
import {
  decryptSensitive,
  merchantWebhookRetryAt,
  MERCHANT_WEBHOOK_MAX_ATTEMPTS,
  parseEncryptionKey,
  signMerchantWebhook,
} from '@paymorph/shared';

const key = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY_V1 ?? '');
const now = new Date();

// Recover only leases abandoned by a crashed worker. The request timeout is
// ten seconds, making this five-minute threshold deliberately conservative.
await db.merchantWebhookDelivery.updateMany({
  where: { status: 'SENDING', lockedAt: { lte: new Date(now.getTime() - 5 * 60 * 1_000) } },
  data: { status: 'PENDING', lockedAt: null, nextAttemptAt: now },
});

const pending = await db.merchantWebhookDelivery.findMany({
  where: {
    status: 'PENDING',
    attempts: { lt: MERCHANT_WEBHOOK_MAX_ATTEMPTS },
    nextAttemptAt: { lte: now },
  },
  orderBy: { nextAttemptAt: 'asc' },
  take: 50,
});

for (const candidate of pending) {
  const claim = await db.merchantWebhookDelivery.updateMany({
    where: { id: candidate.id, status: 'PENDING', nextAttemptAt: { lte: now } },
    data: { status: 'SENDING', lockedAt: now },
  });
  if (claim.count !== 1) continue;

  const delivery = await db.merchantWebhookDelivery.findUniqueOrThrow({
    where: { id: candidate.id },
    include: { merchant: true },
  });
  const attempt = delivery.attempts + 1;
  if (!delivery.merchant.webhookUrl || !delivery.merchant.webhookSecretEnc) {
    await db.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: attempt,
        status: 'FAILED',
        lastError: 'WEBHOOK_NOT_CONFIGURED',
        lockedAt: null,
      },
    });
    continue;
  }

  try {
    const body = JSON.stringify(delivery.payloadJson);
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const secret = decryptSensitive(delivery.merchant.webhookSecretEnc, {
      key,
      aad: `merchant-webhook:${delivery.merchantId}`,
    }).toString('utf8');
    const response = await fetch(delivery.merchant.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymorph-timestamp': timestamp,
        'paymorph-signature': signMerchantWebhook(secret, timestamp, body),
        'paymorph-event': delivery.eventType,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    await db.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: response.ok
        ? {
            attempts: attempt,
            status: 'DELIVERED',
            deliveredAt: new Date(),
            lastError: null,
            lockedAt: null,
          }
        : retryData(attempt, `HTTP_${response.status}`),
    });
  } catch (error) {
    await db.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: retryData(
        attempt,
        error instanceof Error ? error.message.slice(0, 500) : 'DELIVERY_ERROR',
      ),
    });
  }
}

function retryData(attempt: number, lastError: string) {
  return attempt >= MERCHANT_WEBHOOK_MAX_ATTEMPTS
    ? { attempts: attempt, status: 'FAILED', lastError, lockedAt: null }
    : {
        attempts: attempt,
        status: 'PENDING',
        lastError,
        lockedAt: null,
        nextAttemptAt: merchantWebhookRetryAt(new Date(), attempt),
      };
}
