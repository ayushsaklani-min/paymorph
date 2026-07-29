import { db } from '@paymorph/db';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { resolveConfiguredNetwork } from '@/lib/server/network';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const [network] = await Promise.all([resolveConfiguredNetwork(), db.$queryRaw`SELECT 1`]);
    if (!network.xrpUsd.fresh) {
      throw new Error(
        `FTSO XRP/USD feed is stale by ${network.xrpUsd.ageSeconds.toString()} seconds`,
      );
    }
    return jsonSuccess(request, {
      status: 'ready',
      database: 'ready',
      coston2: 'ready',
      fxrp: 'ready',
      usdt0: network.capabilities.USDT0.available
        ? { status: 'ready' }
        : { status: 'degraded', reason: network.capabilities.USDT0.reason },
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
