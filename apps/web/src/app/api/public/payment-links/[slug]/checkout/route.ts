import { jsonError, jsonSuccess } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { startPaymentLinkCheckout } from '@/lib/server/payment-links/service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const { slug } = await params;
    const result = await executeIdempotentMutation({
      request,
      scope: `public:payment-links:${slug}:checkout`,
      requestInput: { slug },
      successStatus: 201,
      releaseOnDomainError: true,
      execute: () => startPaymentLinkCheckout(slug),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
