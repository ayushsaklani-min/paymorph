import { listAdminAttempts } from '@/lib/server/admin/attempts';
import { requireOperator } from '@/lib/server/auth/operator';
import { jsonError, jsonSuccess } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    requireOperator(request);
    return jsonSuccess(request, await listAdminAttempts(new URL(request.url).searchParams));
  } catch (error) {
    return jsonError(request, error);
  }
}
