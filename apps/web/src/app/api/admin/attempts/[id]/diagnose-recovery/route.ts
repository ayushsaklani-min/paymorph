import { z } from 'zod';
import { requireOperator } from '@/lib/server/auth/operator';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';
import { diagnoseAttemptRecovery } from '@/lib/server/recovery/diagnosis';

const idSchema = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMutationOrigin(request);
    requireOperator(request);
    const { id } = await context.params;
    return jsonSuccess(request, await diagnoseAttemptRecovery(idSchema.parse(id)));
  } catch (error) {
    return jsonError(request, error);
  }
}
