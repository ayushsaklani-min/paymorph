import { requireMerchant } from '@/lib/server/auth/session';
import { getDashboardOverview } from '@/lib/server/dashboard/overview';
import { jsonError, jsonSuccess } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    const merchant = await requireMerchant();
    const overview = await getDashboardOverview(merchant.id);
    return jsonSuccess(request, {
      ...overview,
      recent: overview.recent.map((attempt) => ({
        ...attempt,
        createdAt: attempt.createdAt.toISOString(),
        updatedAt: attempt.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
