import { requireMerchant } from '@/lib/server/auth/session';
import { getDashboardOverview } from '@/lib/server/dashboard/overview';
import { jsonError, jsonSuccess } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    const merchant = await requireMerchant();
    const { funnel } = await getDashboardOverview(merchant.id);
    return jsonSuccess(request, funnel);
  } catch (error) {
    return jsonError(request, error);
  }
}
