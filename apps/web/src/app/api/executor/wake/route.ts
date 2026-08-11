import { scheduleExecutorWake, wakeExecutor } from '@/lib/server/executor-wake';
import { assertMutationOrigin, jsonError, jsonSuccess } from '@/lib/server/http';

export const maxDuration = 120;

/**
 * Public same-origin availability hint used by the landing splash. The request
 * can wake a sleeping demo executor, but it cannot create jobs or advance any
 * payment state.
 */
export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);

    if (new URL(request.url).searchParams.get('probe') === '1') {
      const outcome = await wakeExecutor({ reason: 'LANDING_PAGE' }, { timeoutMs: 7_500 });
      const state =
        outcome.status === 'AWAKE'
          ? 'READY'
          : outcome.status === 'DISABLED'
            ? 'DISABLED'
            : 'WARMING';
      return jsonSuccess(request, { state });
    }

    scheduleExecutorWake({ reason: 'LANDING_PAGE' });
    return jsonSuccess(request, { accepted: true }, 202);
  } catch (error) {
    return jsonError(request, error);
  }
}
