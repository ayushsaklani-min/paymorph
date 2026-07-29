import { DomainError } from '@paymorph/shared';
import { describe, expect, it } from 'vitest';
import {
  decodeInvoiceCursor,
  encodeInvoiceCursor,
  parseInvoiceListQuery,
} from '../src/lib/server/invoices/list.js';

const invoiceKey = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: new Date('2026-07-27T12:34:56.789Z'),
};

describe('invoice list query', () => {
  it('uses the documented defaults and filters', () => {
    expect(parseInvoiceListQuery(new URLSearchParams())).toEqual({
      cursor: null,
      limit: 25,
    });

    expect(
      parseInvoiceListQuery(new URLSearchParams('limit=100&status=ACTIVE&settlementAsset=USDT0')),
    ).toMatchObject({
      limit: 100,
      status: 'ACTIVE',
      settlementAsset: 'USDT0',
    });
  });

  it.each(['limit=0', 'limit=101', 'limit=2.5', 'unknown=value', 'limit=1&limit=2'])(
    'rejects an invalid or ambiguous query: %s',
    (query) => {
      expect(() => parseInvoiceListQuery(new URLSearchParams(query))).toThrow();
    },
  );
});

describe('invoice list cursor', () => {
  it('round-trips the stable timestamp and id key', () => {
    const encoded = encodeInvoiceCursor(invoiceKey);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeInvoiceCursor(encoded)).toEqual(invoiceKey);
  });

  it.each([
    '',
    'not+a+base64url+cursor',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        version: 1,
        createdAt: invoiceKey.createdAt.toISOString(),
        id: 'not-a-uuid',
      }),
    ).toString('base64url'),
  ])('rejects a malformed cursor without exposing parser details', (cursor) => {
    expect(() => decodeInvoiceCursor(cursor)).toThrowError(
      new DomainError('VALIDATION_ERROR', 'Invoice cursor is invalid'),
    );
  });
});
