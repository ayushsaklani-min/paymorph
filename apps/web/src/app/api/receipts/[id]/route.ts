import { jsonError, jsonSuccess } from '@/lib/server/http';
import { buildPublicReceipt } from '@/lib/server/receipts/service';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return jsonSuccess(request, await buildPublicReceipt(id));
  } catch (error) {
    return jsonError(request, error);
  }
}
