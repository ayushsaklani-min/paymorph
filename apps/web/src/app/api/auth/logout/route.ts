import { clearMerchantSession } from '@/lib/server/auth/session';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    await clearMerchantSession();
    return jsonSuccess(request, { loggedOut: true });
  } catch (error) {
    return jsonError(request, error);
  }
}
