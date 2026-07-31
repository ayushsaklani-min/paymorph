import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { archivePaymentLink } from '@/lib/server/payment-links/service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const { id } = await params;
    const result = await executeIdempotentMutation({
      request,
      scope: `merchant:${merchant.id}:payment-links:${id}:archive`,
      requestInput: { id },
      successStatus: 200,
      releaseOnDomainError: true,
      execute: () => archivePaymentLink(merchant.id, id),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
