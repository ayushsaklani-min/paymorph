import { describe, expect, it } from 'vitest';
import {
  createPaymentLinkSchema,
  paymentLinkDefaultsSchema,
} from '../src/lib/server/payment-links/service.js';

const defaults = {
  title: 'Creator bundle',
  denomination: 'USD',
  amount: '25.00',
  settlementAsset: 'FXRP',
  expiresInHours: 24,
  recipients: [
    {
      label: 'Merchant',
      address: '0x1111111111111111111111111111111111111111',
      bps: 10_000,
    },
  ],
};

describe('payment link validation', () => {
  it('accepts a reusable link with immutable invoice defaults', () => {
    expect(
      createPaymentLinkSchema.parse({ name: 'Creator bundle', mode: 'REUSABLE', defaults }),
    ).toMatchObject({ name: 'Creator bundle', mode: 'REUSABLE', defaults });
  });

  it('requires a positive amount because a checkout must create an invoice', () => {
    expect(() => paymentLinkDefaultsSchema.parse({ ...defaults, amount: '0' })).toThrow(
      /Amount must be positive/,
    );
  });

  it('rejects a recipient split that cannot be finalized by the router', () => {
    expect(() =>
      paymentLinkDefaultsSchema.parse({
        ...defaults,
        recipients: [{ ...defaults.recipients[0], bps: 9_999 }],
      }),
    ).toThrow(/10,000 bps/);
  });
});
