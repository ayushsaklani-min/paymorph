import { z } from 'zod';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { requireApiKeyMutation } from '@/lib/server/api-keys/auth';
import { publishInvoice, serializeInvoice } from '@/lib/server/invoices/service';

const paramsSchema = z.strictObject({ id: z.uuid() });

/**
 * Server integrations use this after creating their own draft. Published terms
 * remain immutable, exactly as they do for the dashboard route.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const key = await requireApiKeyMutation(request, 'invoices:write');
    const { id } = paramsSchema.parse(await context.params);
    const result = await executeIdempotentMutation({
      request,
      scope: `api-key:${key.id}:invoices:${id}:publish`,
      requestInput: { id },
      successStatus: 200,
      releaseOnDomainError: true,
      execute: async () => serializeInvoice(await publishInvoice(key.merchantId, id)),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
