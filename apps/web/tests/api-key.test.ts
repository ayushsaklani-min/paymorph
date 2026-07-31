import { describe, expect, it } from 'vitest';
import { createApiKeySchema } from '../src/lib/server/api-keys/service.js';

describe('API key validation', () => {
  it('accepts a limited test key configuration', () => {
    expect(
      createApiKeySchema.parse({
        name: 'Store backend',
        scopes: ['invoices:read', 'payment-links:write'],
      }),
    ).toMatchObject({ name: 'Store backend' });
  });
  it('requires at least one documented scope', () => {
    expect(() => createApiKeySchema.parse({ name: 'Empty', scopes: [] })).toThrow();
    expect(() => createApiKeySchema.parse({ name: 'Unknown', scopes: ['admin:*'] })).toThrow();
  });
});
