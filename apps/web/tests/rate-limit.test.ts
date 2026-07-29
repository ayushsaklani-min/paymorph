import { DomainError } from '@paymorph/shared';
import { describe, expect, it } from 'vitest';
import {
  consumeRateLimit,
  type RateLimitStore,
} from '../src/lib/server/rate-limit.js';
import { jsonError } from '../src/lib/server/http.js';

function memoryStore(): RateLimitStore {
  const counts = new Map<string, number>();
  return {
    increment(input) {
      const next = (counts.get(input.key) ?? 0) + 1;
      counts.set(input.key, next);
      return Promise.resolve(next);
    },
  };
}

describe('rate limiting', () => {
  it('allows the configured request count and then fails with retry metadata', async () => {
    const store = memoryStore();
    const now = new Date('2026-07-27T12:00:30.000Z');
    const input = {
      policy: { name: 'quote', maxRequests: 2, windowSeconds: 60 },
      subject: 'payer-hmac',
      now,
      store,
    };

    await expect(consumeRateLimit(input)).resolves.toBeUndefined();
    await expect(consumeRateLimit(input)).resolves.toBeUndefined();
    await expect(consumeRateLimit(input)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: 30 },
    });
  });

  it('uses a new counter when the fixed window changes', async () => {
    const store = memoryStore();
    const policy = { name: 'signin', maxRequests: 1, windowSeconds: 60 };

    await consumeRateLimit({
      policy,
      subject: 'address-hmac',
      now: new Date('2026-07-27T12:00:59.000Z'),
      store,
    });
    await expect(
      consumeRateLimit({
        policy,
        subject: 'address-hmac',
        now: new Date('2026-07-27T12:01:00.000Z'),
        store,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid policies before touching storage', async () => {
    await expect(
      consumeRateLimit({
        policy: { name: 'invalid', maxRequests: 0, windowSeconds: 60 },
        subject: 'subject',
        store: memoryStore(),
      }),
    ).rejects.toThrow(/Invalid rate-limit policy/);
  });

  it('maps rate limits to HTTP 429 with Retry-After', () => {
    const response = jsonError(
      new Request('https://paymorph.example/api/payer/signin'),
      new DomainError('RATE_LIMITED', 'Slow down', { retryAfterSeconds: 17 }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('17');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
