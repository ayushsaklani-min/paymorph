import { createInvoiceSchema } from '@paymorph/shared';
import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { listInvoices } from '@/lib/server/invoices/list';
import { createInvoice, serializeInvoice } from '@/lib/server/invoices/service';

export async function GET(request: Request) {
  try {
    const merchant = await requireMerchant();
    const invoices = await listInvoices(merchant.id, new URL(request.url).searchParams);
    return jsonSuccess(request, invoices);
  } catch (error) {
    return jsonError(request, error);
  }
}

export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const input = createInvoiceSchema.parse(await readJson(request));
    const result = await executeIdempotentMutation({
      request,
      scope: `merchant:${merchant.id}:invoices:create`,
      requestInput: input,
      successStatus: 201,
      releaseOnDomainError: true,
      execute: async () => serializeInvoice(await createInvoice(merchant.id, input)),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
