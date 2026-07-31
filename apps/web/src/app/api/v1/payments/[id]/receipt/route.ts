import { db } from '@paymorph/db';
import { requireApiKey } from '@/lib/server/api-keys/auth';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { buildPublicReceipt } from '@/lib/server/receipts/service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const key = await requireApiKey(request, 'payments:read');
    const id = (await params).id;
    const attempt = await db.paymentAttempt.findFirst({
      where: { id, invoice: { merchantId: key.merchantId } },
      select: { id: true },
    });
    if (!attempt) return jsonSuccess(request, null, 404);
    return jsonSuccess(request, await buildPublicReceipt(attempt.id));
  } catch (error) {
    return jsonError(request, error);
  }
}
