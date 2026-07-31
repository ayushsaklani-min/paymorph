import { db, type MerchantWebhookDelivery } from '@paymorph/db';
import { decryptSensitive, parseEncryptionKey } from '@paymorph/shared';
import { signMerchantWebhook } from './signing.js';

export async function enqueueSettlementWebhook(input: {
  merchantId: string;
  attemptId: string;
  paymentId: string;
  receiptUrl: string;
}): Promise<MerchantWebhookDelivery> {
  return db.merchantWebhookDelivery.create({
    data: {
      merchantId: input.merchantId,
      eventType: 'payment.settled',
      payloadJson: {
        id: input.paymentId,
        type: 'payment.settled',
        data: { attemptId: input.attemptId, receiptUrl: input.receiptUrl },
      },
    },
  });
}

export async function deliverMerchantWebhook(deliveryId: string): Promise<MerchantWebhookDelivery> {
  const delivery = await db.merchantWebhookDelivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: { merchant: true },
  });
  if (!delivery.merchant.webhookUrl || !delivery.merchant.webhookSecretEnc)
    return db.merchantWebhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', lastError: 'WEBHOOK_NOT_CONFIGURED', attempts: { increment: 1 } },
    });
  const key = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY_V1 ?? '');
  const secret = decryptSensitive(delivery.merchant.webhookSecretEnc, {
    key,
    aad: `merchant-webhook:${delivery.merchantId}`,
  }).toString('utf8');
  const body = JSON.stringify(delivery.payloadJson);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  try {
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
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return db.merchantWebhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'DELIVERED',
        attempts: { increment: 1 },
        deliveredAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    return db.merchantWebhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        attempts: { increment: 1 },
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'DELIVERY_ERROR',
      },
    });
  }
}
