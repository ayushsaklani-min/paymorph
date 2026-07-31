import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { revokeApiKey } from '@/lib/server/api-keys/service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const id = (await params).id;
    const result = await executeIdempotentMutation({
      request,
      scope: `merchant:${merchant.id}:api-keys:${id}:revoke`,
      requestInput: { id },
      successStatus: 200,
      releaseOnDomainError: true,
      execute: () => revokeApiKey(merchant.id, id),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
