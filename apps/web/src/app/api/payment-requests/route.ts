import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import {
  createPaymentRequest,
  createPaymentRequestSchema,
  listPaymentRequests,
} from '@/lib/server/payment-requests/service';

export async function GET(request: Request): Promise<Response> {
  try {
    const merchant = await requireMerchant();
    return jsonSuccess(request, await listPaymentRequests(merchant.id));
  } catch (error) {
    return jsonError(request, error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const input = createPaymentRequestSchema.parse(await readJson(request));
    const result = await executeIdempotentMutation({
      request,
      scope: `merchant:${merchant.id}:payment-requests:create`,
      requestInput: input,
      successStatus: 201,
      releaseOnDomainError: true,
      execute: () => createPaymentRequest(merchant.id, input),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
