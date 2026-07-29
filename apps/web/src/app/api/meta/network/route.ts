import { jsonError, jsonSuccess } from '@/lib/server/http';
import { resolveConfiguredNetwork, serializeNetwork } from '@/lib/server/network';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return jsonSuccess(request, serializeNetwork(await resolveConfiguredNetwork()));
  } catch (error) {
    return jsonError(request, error);
  }
}
