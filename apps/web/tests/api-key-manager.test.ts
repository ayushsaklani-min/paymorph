import { describe, expect, it } from 'vitest';
import { filterApiKeyScopes } from '../src/features/developers/api-key-types.js';

describe('API key dashboard projections', () => {
  it('keeps only supported least-privilege scopes from persisted JSON', () => {
    expect(
      filterApiKeyScopes(['invoices:read', 'admin:*', 42, 'payment-links:write', 'payments:read']),
    ).toEqual(['invoices:read', 'payment-links:write', 'payments:read']);
  });

  it('fails closed for malformed persisted scope data', () => {
    expect(filterApiKeyScopes({ scope: 'invoices:write' })).toEqual([]);
    expect(filterApiKeyScopes(null)).toEqual([]);
  });
});
