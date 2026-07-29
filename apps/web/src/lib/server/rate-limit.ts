import { createHmac } from 'node:crypto';
import { db } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { getServerConfig } from './config';

export interface RateLimitPolicy {
  name: string;
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitStore {
  increment(input: {
    key: string;
    windowStart: Date;
    expiresAt: Date;
  }): Promise<number>;
}

const prismaRateLimitStore: RateLimitStore = {
  async increment(input) {
    const bucket = await db.rateLimitBucket.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        count: 1,
        windowStart: input.windowStart,
        expiresAt: input.expiresAt,
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return bucket.count;
  },
};

function requestAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    forwarded ||
    'unknown'
  );
}

export function rateLimitSubject(request: Request, actor?: string): string {
  const raw = actor ? `actor:${actor}` : `address:${requestAddress(request)}`;
  return createHmac('sha256', getServerConfig().SESSION_SECRET).update(raw).digest('hex');
}

export async function consumeRateLimit(input: {
  policy: RateLimitPolicy,
  subject: string;
  now?: Date;
  store?: RateLimitStore;
}): Promise<void> {
  const { policy } = input;
  if (
    !Number.isSafeInteger(policy.maxRequests) ||
    policy.maxRequests < 1 ||
    !Number.isSafeInteger(policy.windowSeconds) ||
    policy.windowSeconds < 1
  ) {
    throw new Error(`Invalid rate-limit policy: ${policy.name}`);
  }

  const now = (input.now ?? new Date()).getTime();
  const windowMs = policy.windowSeconds * 1_000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const key = `${policy.name}:${input.subject}:${windowStartMs.toString()}`;
  const count = await (input.store ?? prismaRateLimitStore).increment({
    key,
    windowStart: new Date(windowStartMs),
    expiresAt: new Date(windowStartMs + windowMs * 2),
  });

  if (count > policy.maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1_000));
    throw new DomainError('RATE_LIMITED', 'Too many requests; retry after the current window', {
      retryAfterSeconds,
    });
  }
}

export async function enforceRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  actor?: string,
): Promise<void> {
  return consumeRateLimit({
    policy,
    subject: rateLimitSubject(request, actor),
  });
}
