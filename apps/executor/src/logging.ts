import pino from 'pino';

export type ExecutorLogger = pino.Logger;

const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,99}$/;

/**
 * These names cover the credential and opaque-evidence fields allowed at the
 * executor boundary. The error serializer below is deliberately narrower than
 * Pino's standard serializer because provider error text may contain request
 * headers or bodies.
 */
export const EXECUTOR_REDACTED_LOG_PATHS = [
  'authorization',
  'cookie',
  'headers.authorization',
  'headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  'fdcVerifierApiKey',
  'privateKey',
  'encryptionKey',
  'userOpDataEnc',
  'signedBlob',
  'userToken',
  'rawBody',
  'payloadJson',
  'proofJson',
] as const;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : undefined;
}

/**
 * Preserve an actionable machine-readable code without serializing arbitrary
 * provider messages, stacks, headers, or raw bodies into operational logs.
 */
export function serializeExecutorError(error: unknown): { type: 'Error'; code?: string } {
  const code = errorCode(error);
  return code === undefined ? { type: 'Error' } : { type: 'Error', code };
}

export function createExecutorLogger(
  options: {
    readonly level?: string;
    readonly destination?: pino.DestinationStream;
  } = {},
): pino.Logger {
  return pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? 'info',
      base: { service: 'paymorph-executor', network: 'XRPL_TESTNET+COSTON2' },
      redact: { paths: [...EXECUTOR_REDACTED_LOG_PATHS], censor: '[REDACTED]' },
      serializers: {
        err: serializeExecutorError,
        error: serializeExecutorError,
      },
    },
    options.destination,
  );
}
