import { describe, expect, it } from 'vitest';
import { createInvoiceSchema } from '../src/schemas/invoice.js';

const valid = {
  title: 'Creator bundle',
  denomination: 'USD',
  amount: '1.00',
  settlementAsset: 'FXRP',
  expiresAt: '2026-07-28T00:00:00.000Z',
  recipients: [
    {
      label: 'Creator',
      address: '0x1111111111111111111111111111111111111111',
      bps: 8_500,
    },
    {
      label: 'Platform',
      address: '0x2222222222222222222222222222222222222222',
      bps: 1_500,
    },
  ],
} as const;

describe('invoice schema', () => {
  it('accepts a canonical exact split', () => {
    expect(createInvoiceSchema.parse(valid).recipients).toHaveLength(2);
  });

  it('rejects duplicate recipients and invalid sums', () => {
    expect(() =>
      createInvoiceSchema.parse({
        ...valid,
        recipients: [
          valid.recipients[0],
          { ...valid.recipients[0], label: 'Duplicate', bps: 1_500 },
        ],
      }),
    ).toThrow();
    expect(() =>
      createInvoiceSchema.parse({
        ...valid,
        recipients: [{ ...valid.recipients[0], bps: 9_999 }],
      }),
    ).toThrow();
  });
});
