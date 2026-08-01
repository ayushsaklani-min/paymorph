import { jsonError, requestIdFor } from '@/lib/server/http';
import {
  collectOperationalMetrics,
  formatOperationalMetrics,
  requireMetricsAuthorization,
} from '@/lib/server/metrics';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireMetricsAuthorization(request);
    const body = formatOperationalMetrics(await collectOperationalMetrics());
    return new Response(body, {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
        'x-request-id': requestIdFor(request),
      },
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
