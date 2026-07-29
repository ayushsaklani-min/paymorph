import { requireMerchant } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';
import { cancelInvoice, serializeInvoice } from '@/lib/server/invoices/service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMutationOrigin(request);
    const merchant = await requireMerchant();
    const { id } = await context.params;
    const invoice = await cancelInvoice(merchant.id, id);
    return jsonSuccess(request, serializeInvoice(invoice));
  } catch (error) {
    return jsonError(request, error);
  }
}
