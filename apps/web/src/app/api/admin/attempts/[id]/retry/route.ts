import { z } from 'zod';
import { JobType } from '@paymorph/db';
import { scheduleExecutorWake } from '@/lib/server/executor-wake';
import { retryAttemptJob, retryAttemptSchema } from '@/lib/server/admin/attempts';
import { requireOperator } from '@/lib/server/auth/operator';
import { assertMutationOrigin, jsonError, jsonSuccess, readJson } from '@/lib/server/http';
import { executeIdempotentMutation } from '@/lib/server/idempotency';

const attemptIdSchema = z.uuid();

export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMutationOrigin(request);
    const operator = requireOperator(request);
    const { id: rawAttemptId } = await context.params;
    const attemptId = attemptIdSchema.parse(rawAttemptId);
    const input = retryAttemptSchema.parse(await readJson(request));
    const jobType = JobType[input.jobType];
    const result = await executeIdempotentMutation({
      request,
      scope: `operator:${operator.id}:attempt:${attemptId}:retry`,
      requestInput: { attemptId, jobType },
      successStatus: 202,
      releaseOnDomainError: true,
      execute: () =>
        retryAttemptJob({
          attemptId,
          requestedJobType: jobType,
          operatorId: operator.id,
        }),
    });
    scheduleExecutorWake({ attemptId, reason: 'OPERATOR_RETRY' });
    return jsonSuccess(request, result.data, result.status);
  } catch (error) {
    return jsonError(request, error);
  }
}
