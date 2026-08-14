import { decryptSensitive, encryptSensitive } from '@paymorph/shared';
import { z } from 'zod';

const apiKeyScopeSchema = z.enum([
  'invoices:read',
  'invoices:write',
  'payment-links:read',
  'payment-links:write',
  'payments:read',
]);

const protectedApiKeyResultSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  prefix: z.string().min(1),
  scopes: z.array(apiKeyScopeSchema).min(1),
  secretEnc: z.string().min(1),
  createdAt: z.iso.datetime(),
});

interface CreatedApiKeyResult {
  id: string;
  name: string;
  prefix: string;
  scopes: z.infer<typeof apiKeyScopeSchema>[];
  secret: string;
  createdAt: Date;
}

export function protectApiKeyResult(created: CreatedApiKeyResult, merchantId: string, key: Buffer) {
  const { secret, createdAt, ...safe } = created;
  return {
    ...safe,
    secretEnc: encryptSensitive(Buffer.from(secret, 'utf8'), {
      key,
      aad: apiKeyAad(merchantId, created.id),
    }),
    createdAt: createdAt.toISOString(),
  };
}

export function revealApiKeyResult(value: unknown, merchantId: string, key: Buffer) {
  const protectedResult = protectedApiKeyResultSchema.parse(value);
  const { secretEnc, ...safe } = protectedResult;
  return {
    ...safe,
    secret: decryptSensitive(secretEnc, {
      key,
      aad: apiKeyAad(merchantId, protectedResult.id),
    }).toString('utf8'),
  };
}

function apiKeyAad(merchantId: string, keyId: string): string {
  return `api-key-create:${merchantId}:${keyId}`;
}
