import { createHash, randomBytes } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { db, ApiKeyStatus, type ApiKey } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';

const scopes = [
  'invoices:read',
  'invoices:write',
  'payment-links:read',
  'payment-links:write',
  'payments:read',
] as const;
export const createApiKeySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(scopes)).min(1).max(scopes.length),
  expiresAt: z.iso.datetime().optional(),
});
export type ApiKeyScope = (typeof scopes)[number];

export async function createApiKey(merchantId: string, input: z.infer<typeof createApiKeySchema>) {
  const secret = `pm_test_${randomBytes(32).toString('base64url')}`;
  const prefix = secret.slice(0, 16);
  const key = await db.apiKey.create({
    data: {
      merchantId,
      name: input.name,
      prefix,
      secretHash: hash(secret),
      scopesJson: input.scopes,
      ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
    },
  });
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: input.scopes,
    secret,
    createdAt: key.createdAt,
  };
}

export async function authenticateApiKey(raw: string, required: ApiKeyScope): Promise<ApiKey> {
  const candidate = await db.apiKey.findFirst({
    where: { prefix: raw.slice(0, 16), status: ApiKeyStatus.ACTIVE },
  });
  if (
    !candidate ||
    (candidate.expiresAt && candidate.expiresAt <= new Date()) ||
    !safeEqual(candidate?.secretHash, hash(raw))
  )
    throw new DomainError('UNAUTHENTICATED', 'API key is invalid');
  const granted = z.array(z.enum(scopes)).safeParse(candidate.scopesJson);
  if (!granted.success || !granted.data.includes(required))
    throw new DomainError('FORBIDDEN', 'API key does not have the required scope');
  void db.apiKey.update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } });
  return candidate;
}

export async function revokeApiKey(merchantId: string, id: string): Promise<ApiKey> {
  const result = await db.apiKey.updateMany({
    where: { id, merchantId, status: ApiKeyStatus.ACTIVE },
    data: { status: ApiKeyStatus.REVOKED, revokedAt: new Date() },
  });
  if (result.count !== 1) throw new DomainError('VALIDATION_ERROR', 'API key cannot be revoked');
  return db.apiKey.findUniqueOrThrow({ where: { id } });
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function safeEqual(left: string | undefined, right: string) {
  return (
    !!left && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right))
  );
}
