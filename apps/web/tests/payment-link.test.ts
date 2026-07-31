import { describe, expect, it } from 'vitest';
import {
  createPaymentLinkSchema,
  decodePaymentLinkCursor,
  encodePaymentLinkCursor,
  parsePaymentLinkListQuery,
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

const linkKey = {
  id: '44444444-4444-4444-8444-444444444444',
  createdAt: new Date('2026-08-01T12:34:56.789Z'),
};

describe('payment-link API pagination', () => {
  it('parses documented filters and defaults', () => {
    expect(parsePaymentLinkListQuery(new URLSearchParams())).toEqual({ cursor: null, limit: 25 });
    expect(
      parsePaymentLinkListQuery(new URLSearchParams('limit=100&status=ARCHIVED')),
    ).toMatchObject({
      limit: 100,
      status: 'ARCHIVED',
    });
  });

  it.each([
    'limit=0',
    'limit=101',
    'status=UNKNOWN',
    'extra=value',
    'status=ACTIVE&status=ARCHIVED',
  ])('rejects an invalid or ambiguous query: %s', (query) => {
    expect(() => parsePaymentLinkListQuery(new URLSearchParams(query))).toThrow();
  });

  it('round-trips an opaque stable cursor', () => {
    const encoded = encodePaymentLinkCursor(linkKey);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePaymentLinkCursor(encoded)).toEqual(linkKey);
  });

  it.each(['', 'not+a+base64url+cursor', Buffer.from('{}').toString('base64url')])(
    'rejects an invalid cursor without exposing parser details: %s',
    (cursor) => {
      expect(() => decodePaymentLinkCursor(cursor)).toThrow('Payment-link cursor is invalid');
    },
  );
});
