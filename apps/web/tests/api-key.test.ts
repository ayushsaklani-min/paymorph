import { afterEach, describe, expect, it } from 'vitest';
import { requireApiKeyMutation } from '../src/lib/server/api-keys/auth.js';
import {
  protectApiKeyResult,
  revealApiKeyResult,
} from '../src/lib/server/api-keys/secret-response.js';
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

  it('encrypts one-time secret material before an idempotent response is stored', () => {
    const encryptionKey = Buffer.alloc(32, 7);
    const protectedResult = protectApiKeyResult(
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Store backend',
        prefix: 'pm_test_example1',
        scopes: ['invoices:write'],
        secret: 'pm_test_plaintext-must-not-be-persisted',
        createdAt: new Date('2026-08-14T12:00:00.000Z'),
      },
      'merchant-1',
      encryptionKey,
    );

    expect(JSON.stringify(protectedResult)).not.toContain('plaintext-must-not-be-persisted');
    expect(revealApiKeyResult(protectedResult, 'merchant-1', encryptionKey)).toMatchObject({
      secret: 'pm_test_plaintext-must-not-be-persisted',
      scopes: ['invoices:write'],
    });
    expect(() => revealApiKeyResult(protectedResult, 'merchant-2', encryptionKey)).toThrow();
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
