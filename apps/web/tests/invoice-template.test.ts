import { describe, expect, it } from 'vitest';
import { invoiceTemplateSchema } from '../src/lib/server/invoices/templates.js';

const input = {
  name: 'Monthly membership',
  defaults: {
    title: 'Membership payment',
    denomination: 'USD',
    amount: '19.99',
    settlementAsset: 'FXRP',
    expiresInHours: 24,
    recipients: [
      {
        label: 'Merchant',
        address: '0x1111111111111111111111111111111111111111',
        bps: 10_000,
      },
    ],
  },
};

describe('invoice template validation', () => {
  it('accepts canonical immutable-invoice defaults', () => {
    expect(invoiceTemplateSchema.parse(input)).toEqual(input);
  });

  it('rejects recipient splits that cannot be used to create an invoice', () => {
    expect(() =>
      invoiceTemplateSchema.parse({
        ...input,
        defaults: {
          ...input.defaults,
          recipients: [{ ...input.defaults.recipients[0], bps: 9_999 }],
        },
      }),
    ).toThrow(/10,000 bps/);
  });

  it.each(['01.00', '-1', '1e2', '0'])('rejects non-canonical amount: %s', (amount) => {
    expect(() =>
      invoiceTemplateSchema.parse({ ...input, defaults: { ...input.defaults, amount } }),
    ).toThrow();
  });
});
