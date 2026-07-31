import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import {
  createInvoiceTemplate,
  invoiceTemplateSchema,
  listInvoiceTemplates,
} from '@/lib/server/invoices/templates';

export async function GET(request: Request): Promise<Response> {
  try {
    const merchant = await requireMerchant();
    return jsonSuccess(request, await listInvoiceTemplates(merchant.id));
  } catch (error) {
    return jsonError(request, error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const input = invoiceTemplateSchema.parse(await readJson(request));
    const result = await executeIdempotentMutation({
      request,
      scope: `merchant:${merchant.id}:invoice-templates:create`,
      requestInput: input,
      successStatus: 201,
      releaseOnDomainError: true,
      execute: () => createInvoiceTemplate(merchant.id, input),
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
