import { createHmac, timingSafeEqual } from 'node:crypto';

export const MERCHANT_WEBHOOK_MAX_ATTEMPTS = 12;
const INITIAL_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1_000;

export function signMerchantWebhook(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function verifyMerchantWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = signMerchantWebhook(secret, timestamp, rawBody);
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))
  );
}

/** Deterministic backoff makes scheduled delivery restart-safe and auditable. */
export function merchantWebhookRetryAt(now: Date, attempt: number): Date {
  const exponent = Math.max(0, Math.min(attempt - 1, 20));
  const delay = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** exponent, MAX_RETRY_DELAY_MS);
  return new Date(now.getTime() + delay);
}
