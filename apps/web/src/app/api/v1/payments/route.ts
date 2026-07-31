import { requireApiKey } from '@/lib/server/api-keys/auth';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { listMerchantPayments } from '@/lib/server/payments/list';

export async function GET(request: Request): Promise<Response> {
  try {
    const key = await requireApiKey(request, 'payments:read');
    return jsonSuccess(
      request,
      await listMerchantPayments(key.merchantId, new URL(request.url).searchParams),
    );
  } catch (error) {
    return jsonError(request, error);
  }
}
