import { DomainError } from '@paymorph/shared';
import { describe, expect, it } from 'vitest';
import {
  decodePaymentCursor,
  encodePaymentCursor,
  parsePaymentListQuery,
} from '../src/lib/server/payments/list.js';

const paymentKey = {
  id: '33333333-3333-4333-8333-333333333333',
  createdAt: new Date('2026-08-01T12:34:56.789Z'),
};

describe('payment list query', () => {
  it('uses documented defaults and merchant-safe filters', () => {
    expect(parsePaymentListQuery(new URLSearchParams())).toEqual({ cursor: null, limit: 25 });
    expect(
      parsePaymentListQuery(
        new URLSearchParams(
          'limit=100&status=FDC_READY&invoiceId=11111111-1111-4111-8111-111111111111',
        ),
      ),
    ).toMatchObject({
      limit: 100,
      status: 'FDC_READY',
      invoiceId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it.each([
    'limit=0',
    'limit=101',
    'status=UNKNOWN',
    'extra=value',
    'status=SETTLED&status=FDC_READY',
  ])('rejects an invalid or ambiguous query: %s', (query) => {
    expect(() => parsePaymentListQuery(new URLSearchParams(query))).toThrow();
  });
});

describe('payment list cursor', () => {
  it('round-trips the stable timestamp and id key', () => {
    const encoded = encodePaymentCursor(paymentKey);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePaymentCursor(encoded)).toEqual(paymentKey);
  });

  it.each([
    '',
    'not+a+base64url+cursor',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        version: 1,
        createdAt: paymentKey.createdAt.toISOString(),
        id: 'not-a-uuid',
      }),
    ).toString('base64url'),
  ])('rejects a malformed cursor without exposing parser details', (cursor) => {
    expect(() => decodePaymentCursor(cursor)).toThrowError(
      new DomainError('VALIDATION_ERROR', 'Payment cursor is invalid'),
    );
  });
});
