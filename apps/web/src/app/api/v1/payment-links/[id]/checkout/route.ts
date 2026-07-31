import { z } from 'zod';
import { requireApiKey } from '@/lib/server/api-keys/auth';
import { getServerConfig } from '@/lib/server/config';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { startMerchantPaymentLinkCheckout } from '@/lib/server/payment-links/service';

const idSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const key = await requireApiKey(request, 'payment-links:write');
    const id = idSchema.parse((await params).id);
    const result = await executeIdempotentMutation({
      request,
      scope: `api-key:${key.id}:payment-links:${id}:checkout`,
      requestInput: { id },
      successStatus: 201,
      releaseOnDomainError: true,
      execute: async () => {
        const checkout = await startMerchantPaymentLinkCheckout(key.merchantId, id);
        const appUrl = getServerConfig().APP_URL.replace(/\/+$/, '');
        return {
          ...checkout,
          checkoutUrl: `${appUrl}/pay/${encodeURIComponent(checkout.invoiceSlug)}`,
        };
      },
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
