import { scheduleExecutorWake } from '@/lib/server/executor-wake';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';

export const maxDuration = 120;

/**
 * Public same-origin availability hint used by the landing splash. The request
 * can wake a sleeping demo executor, but it cannot create jobs or advance any
 * payment state.
 */
export function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    scheduleExecutorWake({ reason: 'LANDING_PAGE' });
    return jsonSuccess(request, { accepted: true }, 202);
  } catch (error) {
    return jsonError(request, error);
  }
}
