import { db } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { serializeInvoice, updateDraftInvoice } from '@/lib/server/invoices/service';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const merchant = await requireMerchant();
    const { id } = await context.params;
    const invoice = await db.invoice.findFirst({
      where: { id, merchantId: merchant.id },
      include: { recipients: { orderBy: { position: 'asc' } } },
    });
    if (!invoice) throw new DomainError('FORBIDDEN', 'Invoice not found');
    return jsonSuccess(request, serializeInvoice(invoice));
  } catch (error) {
    return jsonError(request, error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const { id } = await context.params;
    const invoice = await updateDraftInvoice(merchant.id, id, await readJson(request));
    return jsonSuccess(request, serializeInvoice(invoice));
  } catch (error) {
    return jsonError(request, error);
  }
}
