import { describe, expect, it } from 'vitest';
import {
  signMerchantWebhook,
  verifyMerchantWebhook,
} from '../src/lib/server/merchant-webhooks/signing.js';

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
