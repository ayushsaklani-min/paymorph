import { afterEach, describe, expect, it } from 'vitest';
import { requireApiKeyMutation } from '../src/lib/server/api-keys/auth.js';
import { createApiKeySchema } from '../src/lib/server/api-keys/service.js';

const previousAppUrl = process.env.APP_URL;

afterEach(() => {
  process.env.APP_URL = previousAppUrl;
});

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

  it('rejects browser cross-site mutations before inspecting a bearer key', async () => {
    process.env.APP_URL = 'https://paymorph.example';
    const request = new Request('https://paymorph.example/api/v1/invoices', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
    });

    await expect(requireApiKeyMutation(request, 'invoices:write')).rejects.toThrow(
      'Cross-site mutation request rejected',
    );
  });
});
