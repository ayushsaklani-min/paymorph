import type pino from 'pino';
import type { ExecutorHandlers } from './handlers.js';
import type { ExecutorStore } from './types.js';

export interface WorkerOptions {
  readonly workerId: string;
  readonly batchSize: number;
  readonly leaseMs: number;
  readonly pollIntervalMs: number;
}

export async function runExecutorWorker(
  store: ExecutorStore,
  handlers: ExecutorHandlers,
  options: WorkerOptions,
  logger: pino.Logger,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    let jobs;
    try {
      jobs = await store.claim(options.workerId, options.batchSize, options.leaseMs);
    } catch (error) {
      logger.error({ err: error }, 'executor job claim failed');
      await abortableDelay(options.pollIntervalMs, signal);
      continue;
    }
    if (jobs.length === 0) {
      await abortableDelay(options.pollIntervalMs, signal);
      continue;
    }
    for (const job of jobs) {
      if (signal.aborted) return;
      try {
        const result = await handlers.handle(job);
        if (result.status === 'COMPLETE') {
          await store.complete(job.id, options.workerId);
          logger.info(
            { jobId: job.id, attemptId: job.attemptId, jobType: job.jobType },
            'job completed',
          );
        } else {
          await store.retry(
            job.id,
            options.workerId,
            result.code,
            result.detail,
            new Date(Date.now() + result.retryAfterMs),
          );
          logger.info(
            { jobId: job.id, jobType: job.jobType, code: result.code },
            'job scheduled for retry',
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, jobId: job.id, jobType: job.jobType }, 'job handler failed');
        try {
          await store.retry(
            job.id,
            options.workerId,
            'UNEXPECTED_HANDLER_ERROR',
            message,
            new Date(Date.now() + options.pollIntervalMs),
          );
        } catch (leaseError) {
          logger.error({ err: leaseError, jobId: job.id }, 'unable to reschedule failed job');
        }
      }
    }
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
