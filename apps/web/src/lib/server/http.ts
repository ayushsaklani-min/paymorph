import { DomainError, errorEnvelope, successEnvelope, type ApiEnvelope } from '@paymorph/shared';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function jsonSuccess<T>(
  request: Request,
  data: T,
  status = 200,
): NextResponse<ApiEnvelope<T>> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  return NextResponse.json(successEnvelope(data, requestId), {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}

export function jsonError(request: Request, error: unknown): NextResponse<ApiEnvelope<never>> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  if (error instanceof ZodError) {
    return NextResponse.json(
      errorEnvelope('VALIDATION_ERROR', 'Request validation failed', error.issues, requestId),
      { status: 400, headers: { 'x-request-id': requestId } },
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
  console.error({ requestId, error }, 'Unhandled API error');
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
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(process.env.APP_URL ?? request.url).origin;
  } catch {
    throw new DomainError('INTERNAL_ERROR', 'APP_URL is invalid');
  }
  if (origin !== expectedOrigin) {
    throw new DomainError('FORBIDDEN', 'Mutation origin does not match PayMorph');
  }
}
