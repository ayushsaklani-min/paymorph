import { DomainError } from '@paymorph/shared';
import { z } from 'zod';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';
import { readPayerSessionToken, requireActivePayerSessionId } from '@/lib/server/payer-session';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { createRecoveryPayload } from '@/lib/server/recovery';

const idSchema = z.string().uuid();
const requestSchema = z.strictObject({});

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    assertMutationOrigin(request);
    const token = readPayerSessionToken(request);
    if (token === null) {
      throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session required');
    }
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = idSchema.parse(rawAttemptId);
    const input = requestSchema.parse(await readJson(request, 1_024));
    const payerSessionId = await requireActivePayerSessionId(token);
    await enforceRateLimit(
      request,
      { name: 'xaman-recovery-payload', maxRequests: 3, windowSeconds: 600 },
      payerSessionId,
    );
    const result = await executeIdempotentMutation({
      request,
      scope: `payer-session:${payerSessionId}:attempt:${attemptId}:recovery-payload:create`,
      requestInput: { attemptId, ...input },
      successStatus: 201,
      execute: () => createRecoveryPayload(attemptId, token),
      // Eligibility can change after reconciliation. Release a pre-provider
      // rejection so the same explicit payer action can be retried later.
      releaseOnDomainError: true,
    });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
