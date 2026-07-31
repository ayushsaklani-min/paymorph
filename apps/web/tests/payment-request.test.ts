import { describe, expect, it } from 'vitest';
import { createPaymentRequestSchema } from '../src/lib/server/payment-requests/service.js';

const invoice = {
  title: 'Design retainer',
  denomination: 'USD',
  amount: '250.00',
  settlementAsset: 'FXRP',
  expiresAt: '2026-08-02T12:00:00.000Z',
  recipients: [
    { label: 'Merchant', address: '0x1111111111111111111111111111111111111111', bps: 10_000 },
  ],
};

describe('payment request validation', () => {
  it('requires a named canonical invoice request', () => {
    expect(
      createPaymentRequestSchema.parse({
        reference: 'RET-001',
        recipientEmail: 'payer@example.com',
        invoice,
      }),
    ).toMatchObject({ reference: 'RET-001', invoice });
  });

  it('rejects malformed recipient email and a non-finalizable split', () => {
    expect(() =>
      createPaymentRequestSchema.parse({
        reference: 'RET-001',
        recipientEmail: 'invalid',
        invoice,
      }),
    ).toThrow();
    expect(() =>
      createPaymentRequestSchema.parse({
        reference: 'RET-001',
        invoice: { ...invoice, recipients: [{ ...invoice.recipients[0], bps: 9_999 }] },
      }),
    ).toThrow();
  });
});
