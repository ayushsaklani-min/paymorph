import { createInvoiceSchema } from '@paymorph/shared';
import { jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { listInvoices } from '@/lib/server/invoices/list';
import { createInvoice, serializeInvoice } from '@/lib/server/invoices/service';
import { requireApiKey, requireApiKeyMutation } from '@/lib/server/api-keys/auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const key = await requireApiKey(request, 'invoices:read');
    return jsonSuccess(
      request,
      await listInvoices(key.merchantId, new URL(request.url).searchParams),
    );
  } catch (error) {
    return jsonError(request, error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const key = await requireApiKeyMutation(request, 'invoices:write');
    const input = createInvoiceSchema.parse(await readJson(request));
    const result = await executeIdempotentMutation({
      request,
      scope: `api-key:${key.id}:invoices:create`,
      requestInput: input,
      successStatus: 201,
      releaseOnDomainError: true,
      execute: async () => serializeInvoice(await createInvoice(key.merchantId, input)),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
