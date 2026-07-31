import { z } from 'zod';
import { requireMerchant } from '@/lib/server/auth/session';
import { getDashboardTimeseries } from '@/lib/server/dashboard/overview';
import { jsonError, jsonSuccess } from '@/lib/server/http';

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) });

export async function GET(request: Request) {
  try {
    const merchant = await requireMerchant();
    const url = new URL(request.url);
    const { days } = querySchema.parse(Object.fromEntries(url.searchParams));
    return jsonSuccess(request, await getDashboardTimeseries(merchant.id, days));
  } catch (error) {
    return jsonError(request, error);
  }
}
