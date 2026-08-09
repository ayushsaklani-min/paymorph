import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseExecutorWakeUrl, wakeExecutor } from '../src/lib/server/executor-wake.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('executor wake endpoint validation', () => {
  it('allows a credential-free production HTTPS health endpoint', () => {
    expect(parseExecutorWakeUrl('https://executor.example/health', 'production')?.toString()).toBe(
      'https://executor.example/health',
    );
  });

  it('allows localhost HTTP only outside production', () => {
    expect(parseExecutorWakeUrl('http://127.0.0.1:10000/health', 'development')?.port).toBe(
      '10000',
    );
    expect(() => parseExecutorWakeUrl('http://127.0.0.1:10000/health', 'production')).toThrow(
      /HTTPS/,
    );
  });

  it.each([
    'https://user:secret@executor.example/health',
    'https://executor.example/health?token=secret',
    'https://executor.example/other',
  ])('rejects unsafe endpoint %s', (url) => {
    expect(() => parseExecutorWakeUrl(url, 'production')).toThrow(/credential-free/);
  });
});

describe('executor wake delivery', () => {
  it('does nothing when the optional endpoint is disabled', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      wakeExecutor(
        { attemptId: crypto.randomUUID(), reason: 'PAYMENT_JOB_READY' },
        { appEnv: 'production', fetcher, wakeUrl: '' },
      ),
    ).resolves.toEqual({ status: 'DISABLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requests health without following redirects or reading a response body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await wakeExecutor(
      { attemptId: crypto.randomUUID(), reason: 'RECOVERY_JOB_READY' },
      {
        appEnv: 'production',
        fetcher,
        timeoutMs: 5_000,
        wakeUrl: 'https://executor.example/health',
      },
    );
    expect(result).toEqual({ status: 'AWAKE', httpStatus: 200 });
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://executor.example/health'),
      expect.objectContaining({ method: 'GET', cache: 'no-store', redirect: 'error' }),
    );
  });

  it('leaves a durable job retryable when the wake endpoint is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      wakeExecutor(
        { attemptId: crypto.randomUUID(), reason: 'OPERATOR_RETRY' },
        {
          appEnv: 'production',
          fetcher,
          wakeUrl: 'https://executor.example/health',
        },
      ),
    ).resolves.toEqual({ status: 'UNAVAILABLE', httpStatus: 503 });
  });
});
