import { DomainError, errorEnvelope, successEnvelope, type ApiEnvelope } from '@paymorph/shared';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Honor well-formed correlation IDs from trusted infrastructure while keeping
 * response and log fields bounded. Arbitrary header values must not become
 * identifiers that downstream log/index systems interpret unexpectedly.
 */
export function requestIdFor(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  return supplied !== null && REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
}

function logUnhandledApiError(request: Request, requestId: string, error: unknown): void {
  console.error(
    {
      event: 'api.unhandled_error',
      requestId,
      method: request.method,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    },
    'Unhandled API error',
  );
}

export function jsonSuccess<T>(
  request: Request,
  data: T,
  status = 200,
): NextResponse<ApiEnvelope<T>> {
  const requestId = requestIdFor(request);
  return NextResponse.json(successEnvelope(data, requestId), {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}

export function jsonError(request: Request, error: unknown): NextResponse<ApiEnvelope<never>> {
  const requestId = requestIdFor(request);

  if (error instanceof ZodError) {
    return NextResponse.json(
      errorEnvelope('VALIDATION_ERROR', 'Request validation failed', error.issues, requestId),
      { status: 400, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
    );
  }
  if (error instanceof DomainError) {
    const status =
      error.code === 'UNAUTHENTICATED' || error.code === 'PAYER_NOT_IDENTIFIED'
        ? 401
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'RATE_LIMITED'
            ? 429
            : error.code === 'INVOICE_NOT_ACTIVE' || error.code === 'IDEMPOTENCY_CONFLICT'
              ? 409
              : error.code === 'RECOVERY_NOT_ELIGIBLE'
                ? 409
                : error.code === 'INTERNAL_ERROR'
                  ? 500
                  : 400;
    const retryAfterSeconds =
      error.code === 'RATE_LIMITED' &&
      typeof error.details === 'object' &&
      error.details !== null &&
      'retryAfterSeconds' in error.details &&
      typeof error.details.retryAfterSeconds === 'number'
        ? error.details.retryAfterSeconds
        : undefined;
    return NextResponse.json(errorEnvelope(error.code, error.message, error.details, requestId), {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId,
        ...(retryAfterSeconds ? { 'retry-after': retryAfterSeconds.toString() } : {}),
      },
    });
  }
  logUnhandledApiError(request, requestId, error);
  return NextResponse.json(
    errorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred', undefined, requestId),
    { status: 500, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
  );
}

export async function readJson(request: Request, maxBytes = 64 * 1_024): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new DomainError('VALIDATION_ERROR', 'Request body is too large');
  }
  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > maxBytes) {
    throw new DomainError('VALIDATION_ERROR', 'Request body is too large');
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Request body must be valid JSON');
  }
}

export function assertMutationOrigin(request: Request): void {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    throw new DomainError('FORBIDDEN', 'Cross-site mutation request rejected');
  }
  const origin = request.headers.get('origin');
  if (origin === null) {
    // Non-browser clients do not always send Origin. Cookie-bearing browser
    // requests do, and Sec-Fetch-Site adds a second rejection signal.
    return;
  }
  let trustedOrigins: Set<string>;
  try {
    trustedOrigins = new Set([
      new URL(process.env.APP_URL ?? request.url).origin,
      ...(process.env.MUTATION_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => new URL(value).origin),
    ]);
  } catch {
    throw new DomainError('INTERNAL_ERROR', 'PayMorph mutation-origin configuration is invalid');
  }
  if (!trustedOrigins.has(origin)) {
    throw new DomainError('FORBIDDEN', 'Mutation origin does not match PayMorph');
  }
}
