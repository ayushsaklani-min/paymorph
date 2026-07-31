import { describe, expect, it } from 'vitest';
import {
  merchantWebhookRetryAt,
  signMerchantWebhook,
  verifyMerchantWebhook,
} from '@paymorph/shared';

describe('merchant webhook signing', () => {
  it('signs the exact timestamp and raw JSON body', () => {
    const signature = signMerchantWebhook('secret', '1720000000', '{"type":"payment.settled"}');
    expect(
      verifyMerchantWebhook('secret', '1720000000', '{"type":"payment.settled"}', signature),
    ).toBe(true);
    expect(
      verifyMerchantWebhook('secret', '1720000000', '{"type":"payment.failed"}', signature),
    ).toBe(false);
  });
});

describe('merchant webhook retry schedule', () => {
  it('uses bounded deterministic exponential backoff', () => {
    const now = new Date('2026-07-31T00:00:00.000Z');
    expect(merchantWebhookRetryAt(now, 1).toISOString()).toBe('2026-07-31T00:01:00.000Z');
    expect(merchantWebhookRetryAt(now, 2).toISOString()).toBe('2026-07-31T00:02:00.000Z');
    expect(merchantWebhookRetryAt(now, 99).toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});
