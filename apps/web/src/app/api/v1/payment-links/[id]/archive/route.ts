import { z } from 'zod';
import { requireApiKey } from '@/lib/server/api-keys/auth';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { archivePaymentLink } from '@/lib/server/payment-links/service';

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
      scope: `api-key:${key.id}:payment-links:${id}:archive`,
      requestInput: { id },
      successStatus: 200,
      releaseOnDomainError: true,
      execute: () => archivePaymentLink(key.merchantId, id),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
