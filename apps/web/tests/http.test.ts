import { describe, expect, it, vi } from 'vitest';
import { jsonError, jsonSuccess, requestIdFor } from '../src/lib/server/http.js';

describe('HTTP response boundaries', () => {
  it('retains a bounded infrastructure request ID and replaces unsafe values', async () => {
    const trusted = new Request('https://paymorph.example/api/health', {
      headers: { 'x-request-id': 'edge-01.request_42' },
    });
    const untrusted = new Request('https://paymorph.example/api/health', {
      headers: { 'x-request-id': 'not allowed!' },
    });

    expect(requestIdFor(trusted)).toBe('edge-01.request_42');
    expect(requestIdFor(untrusted)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const response = jsonSuccess(trusted, { ok: true });
    expect(response.headers.get('x-request-id')).toBe('edge-01.request_42');
    await expect(response.json()).resolves.toMatchObject({ requestId: 'edge-01.request_42' });
  });

  it('does not put unexpected error messages into server logs', () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new Request('https://paymorph.example/api/example', { method: 'POST' });

    const response = jsonError(request, new Error('provider secret: should-not-be-logged'));

    expect(response.status).toBe(500);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('should-not-be-logged');
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'api.unhandled_error', method: 'POST', errorType: 'Error' }),
      'Unhandled API error',
    );
    errorLog.mockRestore();
  });

  it('returns a safe retryable response when Prisma cannot reach the database', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const databaseError = Object.assign(
      new Error("Can't reach database server at `127.0.0.1:5432`"),
      {
        code: 'P1001',
        name: 'PrismaClientInitializationError',
      },
    );
    const response = jsonError(
      new Request('https://paymorph.example/api/auth/nonce'),
      databaseError,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'PayMorph is temporarily unavailable. Please try again in a moment.',
      },
    });
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'api.database_unavailable' }),
      'Database unavailable',
    );
    errorLog.mockRestore();
  });
});
