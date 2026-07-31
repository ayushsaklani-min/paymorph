import { createHmac } from 'node:crypto';
import { db } from '@paymorph/db';
import { decryptSensitive, parseEncryptionKey } from '@paymorph/shared';

const key = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY_V1 ?? '');
const pending = await db.merchantWebhookDelivery.findMany({
  where: { status: 'PENDING', attempts: { lt: 12 } },
  include: { merchant: true },
  orderBy: { createdAt: 'asc' },
  take: 50,
});

for (const delivery of pending) {
  const attempt = delivery.attempts + 1;
  if (!delivery.merchant.webhookUrl || !delivery.merchant.webhookSecretEnc) {
    await db.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: { attempts: attempt, status: 'FAILED', lastError: 'WEBHOOK_NOT_CONFIGURED' },
    });
    continue;
  }
  const body = JSON.stringify(delivery.payloadJson);
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const secret = decryptSensitive(delivery.merchant.webhookSecretEnc, {
    key,
    aad: `merchant-webhook:${delivery.merchantId}`,
  }).toString('utf8');
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  try {
    const response = await fetch(delivery.merchant.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymorph-timestamp': timestamp,
        'paymorph-signature': signature,
        'paymorph-event': delivery.eventType,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    await db.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: response.ok
        ? { attempts: attempt, status: 'DELIVERED', deliveredAt: new Date(), lastError: null }
        : {
            attempts: attempt,
            lastError: `HTTP_${response.status}`,
            ...(attempt >= 12 ? { status: 'FAILED' } : {}),
          },
    });
  } catch (error) {
    await db.merchantWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: attempt,
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'DELIVERY_ERROR',
        ...(attempt >= 12 ? { status: 'FAILED' } : {}),
      },
    });
  }
}
