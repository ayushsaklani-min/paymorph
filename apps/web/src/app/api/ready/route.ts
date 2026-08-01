import { db } from '@paymorph/db';
import { assertConfiguredFdcVerifierReady } from '@/lib/server/fdc/verifier-readiness';
import { jsonError, jsonSuccess } from '@/lib/server/http';
import { resolveConfiguredNetwork } from '@/lib/server/network';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const [network] = await Promise.all([
      resolveConfiguredNetwork(),
      db.$queryRaw`SELECT 1`,
      assertConfiguredFdcVerifierReady(),
    ]);
    if (!network.xrpUsd.fresh) {
      throw new Error(
        `FTSO XRP/USD feed is stale by ${network.xrpUsd.ageSeconds.toString()} seconds`,
      );
    }
    return jsonSuccess(request, {
      status: 'ready',
      database: 'ready',
      coston2: 'ready',
      fdc: 'ready',
      fxrp: 'ready',
      usdt0: network.capabilities.USDT0.available
        ? { status: 'ready', routeKind: network.capabilities.USDT0.routeKind }
        : { status: 'degraded', reason: network.capabilities.USDT0.reason },
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
