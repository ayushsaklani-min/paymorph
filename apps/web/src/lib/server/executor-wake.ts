import { after } from 'next/server';

const DEFAULT_WAKE_TIMEOUT_MS = 120_000;

export type ExecutorWakeReason = 'PAYMENT_JOB_READY' | 'RECOVERY_JOB_READY' | 'OPERATOR_RETRY';

export type ExecutorWakeOutcome =
  | { status: 'DISABLED' }
  | { status: 'AWAKE'; httpStatus: number }
  | { status: 'UNAVAILABLE'; httpStatus?: number; errorType?: string }
  | { status: 'INVALID_CONFIGURATION' };

interface ExecutorWakeInput {
  readonly attemptId: string;
  readonly reason: ExecutorWakeReason;
}

interface ExecutorWakeOptions {
  readonly appEnv?: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
  readonly wakeUrl?: string;
}

/**
 * Resolve the optional wake endpoint without allowing credentials, redirects,
 * or arbitrary paths. Production wake traffic must always use HTTPS.
 */
export function parseExecutorWakeUrl(
  raw = process.env.EXECUTOR_WAKE_URL,
  appEnv = process.env.APP_ENV,
): URL | null {
  const value = raw?.trim();
  if (!value) return null;

  const url = new URL(value);
  const localDevelopmentEndpoint =
    appEnv !== 'production' &&
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localDevelopmentEndpoint) {
    throw new Error('Executor wake URL must use HTTPS');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/health') {
    throw new Error('Executor wake URL must be a credential-free /health endpoint');
  }
  return url;
}

/**
 * Wake a sleeping demo executor after its durable job has committed. A wake is
 * only an availability hint: its response never advances payment state and a
 * failure leaves the queued job intact for an operator or later retry.
 */
export async function wakeExecutor(
  input: ExecutorWakeInput,
  options: ExecutorWakeOptions = {},
): Promise<ExecutorWakeOutcome> {
  let endpoint: URL | null;
  try {
    endpoint = parseExecutorWakeUrl(options.wakeUrl, options.appEnv);
  } catch (error) {
    logWake(input, {
      status: 'INVALID_CONFIGURATION',
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return { status: 'INVALID_CONFIGURATION' };
  }
  if (endpoint === null) return { status: 'DISABLED' };

  const timeoutMs = options.timeoutMs ?? DEFAULT_WAKE_TIMEOUT_MS;
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const result = { status: 'UNAVAILABLE' as const, httpStatus: response.status };
      logWake(input, result);
      return result;
    }
    const result = { status: 'AWAKE' as const, httpStatus: response.status };
    logWake(input, result);
    return result;
  } catch (error) {
    const result = {
      status: 'UNAVAILABLE' as const,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    };
    logWake(input, result);
    return result;
  }
}

export function scheduleExecutorWake(input: ExecutorWakeInput): void {
  if (!process.env.EXECUTOR_WAKE_URL?.trim()) return;
  after(() => wakeExecutor(input));
}

function logWake(
  input: ExecutorWakeInput,
  result: Exclude<ExecutorWakeOutcome, { status: 'DISABLED' }> & { errorType?: string },
): void {
  const fields = {
    event: 'executor.wake',
    attemptId: input.attemptId,
    reason: input.reason,
    outcome: result.status,
    ...('httpStatus' in result ? { httpStatus: result.httpStatus } : {}),
    ...(result.errorType === undefined ? {} : { errorType: result.errorType }),
  };
  if (result.status === 'AWAKE') {
    console.info(fields, 'Executor wake completed');
  } else {
    console.warn(fields, 'Executor wake did not complete');
  }
}
