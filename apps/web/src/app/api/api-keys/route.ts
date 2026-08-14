import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { createApiKey, createApiKeySchema } from '@/lib/server/api-keys/service';
import { protectApiKeyResult, revealApiKeyResult } from '@/lib/server/api-keys/secret-response';
import { db } from '@paymorph/db';
import { parseEncryptionKey } from '@paymorph/shared';

export async function GET(request: Request): Promise<Response> {
  try {
    const merchant = await requireMerchant();
    const keys = await db.apiKey.findMany({
      where: { merchantId: merchant.id },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopesJson: true,
        status: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return jsonSuccess(request, keys);
  } catch (error) {
    return jsonError(request, error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const input = createApiKeySchema.parse(await readJson(request));
    const encryptionKey = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY_V1 ?? '');
    const result = await executeIdempotentMutation({
      request,
      scope: `merchant:${merchant.id}:api-keys:create`,
      requestInput: input,
      successStatus: 201,
      releaseOnDomainError: true,
      execute: async () =>
        protectApiKeyResult(await createApiKey(merchant.id, input), merchant.id, encryptionKey),
    });
    return jsonSuccess(
      request,
      revealApiKeyResult(result.data, merchant.id, encryptionKey),
      result.status,
    );
  } catch (error) {
    return jsonError(request, error);
  }
}
