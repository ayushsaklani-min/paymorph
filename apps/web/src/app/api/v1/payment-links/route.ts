import { requireApiKey } from '@/lib/server/api-keys/auth';
import { jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import {
  createPaymentLink,
  createPaymentLinkSchema,
  listPaymentLinks,
} from '@/lib/server/payment-links/service';

export async function GET(request: Request): Promise<Response> {
  try {
    const key = await requireApiKey(request, 'payment-links:read');
    return jsonSuccess(request, await listPaymentLinks(key.merchantId));
  } catch (error) {
    return jsonError(request, error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const key = await requireApiKey(request, 'payment-links:write');
    const input = createPaymentLinkSchema.parse(await readJson(request));
    const result = await executeIdempotentMutation({
      request,
      scope: `api-key:${key.id}:payment-links:create`,
      requestInput: input,
      successStatus: 201,
      releaseOnDomainError: true,
      execute: () => createPaymentLink(key.merchantId, input),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
