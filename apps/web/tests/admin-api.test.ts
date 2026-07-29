import { AttemptStatus, JobType } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { describe, expect, it } from 'vitest';
import { OPERATOR_SESSION_COOKIE, requireOperator } from '../src/lib/server/auth/operator.js';
import {
  decodeAdminAttemptCursor,
  encodeAdminAttemptCursor,
  parseAdminAttemptListQuery,
  planAttemptRetry,
  retrySafeJobType,
  serializeAdminAttempt,
} from '../src/lib/server/admin/attempts.js';
import { jsonError } from '../src/lib/server/http.js';

const OPERATOR_TOKEN = 'a'.repeat(43);
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

function operatorRequest(cookie: string): Request {
  return new Request('https://paymorph.example/api/admin/attempts', {
    headers: { cookie },
  });
}

function job(
  overrides: Partial<{
    id: string;
    jobType: JobType;
    generation: number;
    status: 'READY' | 'RUNNING' | 'RETRY' | 'SUCCEEDED' | 'DEAD';
    nextRunAt: Date;
  }> = {},
) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    jobType: JobType.VALIDATE_XRPL,
    generation: 0,
    status: 'DEAD' as const,
    nextRunAt: new Date('2026-07-27T00:00:00.000Z'),
    ...overrides,
  };
}

describe('operator authentication', () => {
  it('accepts only the dedicated operator cookie', () => {
    const identity = requireOperator(
      operatorRequest(`${OPERATOR_SESSION_COOKIE}=${OPERATOR_TOKEN}`),
      OPERATOR_TOKEN,
    );
    expect(identity.id).toMatch(/^[a-f0-9]{32}$/);

    expect(() =>
      requireOperator(operatorRequest(`paymorph_session=${OPERATOR_TOKEN}`), OPERATOR_TOKEN),
    ).toThrow(/Operator session required/);
    expect(() =>
      requireOperator(
        operatorRequest(`${OPERATOR_SESSION_COOKIE}=${'b'.repeat(43)}`),
        OPERATOR_TOKEN,
      ),
    ).toThrow(/invalid/);
  });

  it('fails closed when the server token is malformed', () => {
    const error = new DomainError('INTERNAL_ERROR', 'Operator authentication is not configured');
    expect(() =>
      requireOperator(operatorRequest(`${OPERATOR_SESSION_COOKIE}=${OPERATOR_TOKEN}`), 'too-short'),
    ).toThrowError(error);
    expect(jsonError(operatorRequest(''), error).status).toBe(500);
  });
});

describe('admin attempt pagination', () => {
  const key = {
    id: ATTEMPT_ID,
    updatedAt: new Date('2026-07-27T12:34:56.789Z'),
  };

  it('round-trips an opaque stable updatedAt/id cursor', () => {
    const encoded = encodeAdminAttemptCursor(key);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAdminAttemptCursor(encoded)).toEqual(key);
  });

  it('parses documented defaults and filters strictly', () => {
    expect(parseAdminAttemptListQuery(new URLSearchParams())).toEqual({
      cursor: null,
      limit: 25,
    });
    expect(
      parseAdminAttemptListQuery(
        new URLSearchParams(
          'limit=100&status=FDC_REQUESTED&olderThan=2026-07-27T12%3A00%3A00.000Z',
        ),
      ),
    ).toMatchObject({
      limit: 100,
      status: AttemptStatus.FDC_REQUESTED,
      olderThan: new Date('2026-07-27T12:00:00.000Z'),
    });
  });

  it.each(['limit=0', 'limit=101', 'status=UNKNOWN', 'extra=value', 'limit=1&limit=2'])(
    'rejects invalid or ambiguous query input: %s',
    (query) => {
      expect(() => parseAdminAttemptListQuery(new URLSearchParams(query))).toThrow();
    },
  );
});

describe('retry-safe job mapping', () => {
  it.each([
    [AttemptStatus.XRPL_SIGNED, JobType.VALIDATE_XRPL],
    [AttemptStatus.XRPL_VALIDATED, JobType.REQUEST_FDC],
    [AttemptStatus.FDC_REQUESTED, JobType.REQUEST_FDC],
    [AttemptStatus.FDC_READY, JobType.SUBMIT_FLARE],
    [AttemptStatus.FLARE_CONFIRMED, JobType.INDEX_EVENTS],
  ])('maps %s only to %s', (status, expected) => {
    expect(retrySafeJobType(status)).toBe(expected);
  });

  it('requires a confirmed checkpoint before resuming FLARE_SUBMITTED', () => {
    expect(retrySafeJobType(AttemptStatus.FLARE_SUBMITTED)).toBeNull();
    expect(retrySafeJobType(AttemptStatus.FLARE_SUBMITTED, true)).toBe(JobType.SUBMIT_FLARE);
  });

  it.each([
    AttemptStatus.SETTLED,
    AttemptStatus.XRPL_FAILED,
    AttemptStatus.EXECUTION_REVERTED,
    AttemptStatus.RECOVERY_REQUIRED,
    AttemptStatus.REJECTED,
  ])('does not retry terminal or recovery state %s', (status) => {
    expect(retrySafeJobType(status)).toBeNull();
  });

  it('returns an already-ready job and reactivates a retryable job', () => {
    expect(
      planAttemptRetry({
        attemptStatus: AttemptStatus.XRPL_SIGNED,
        requestedJobType: JobType.VALIDATE_XRPL,
        jobs: [job({ status: 'READY' })],
      }),
    ).toMatchObject({ kind: 'existing' });
    expect(
      planAttemptRetry({
        attemptStatus: AttemptStatus.XRPL_SIGNED,
        requestedJobType: JobType.VALIDATE_XRPL,
        jobs: [job({ status: 'RETRY' })],
      }),
    ).toMatchObject({ kind: 'reactivate' });
  });

  it('preserves terminal job history by creating the next generation', () => {
    expect(
      planAttemptRetry({
        attemptStatus: AttemptStatus.FDC_READY,
        requestedJobType: JobType.SUBMIT_FLARE,
        jobs: [
          job({ jobType: JobType.SUBMIT_FLARE, generation: 1, status: 'SUCCEEDED' }),
          job({ jobType: JobType.SUBMIT_FLARE, generation: 2, status: 'DEAD' }),
        ],
      }),
    ).toEqual({ kind: 'create', generation: 3 });
  });

  it('rejects a mismatched, running, or competing active job', () => {
    expect(() =>
      planAttemptRetry({
        attemptStatus: AttemptStatus.XRPL_SIGNED,
        requestedJobType: JobType.REQUEST_FDC,
        jobs: [],
      }),
    ).toThrow(/not retry-safe/);
    expect(() =>
      planAttemptRetry({
        attemptStatus: AttemptStatus.XRPL_SIGNED,
        requestedJobType: JobType.VALIDATE_XRPL,
        jobs: [job({ status: 'RUNNING' })],
      }),
    ).toThrow(/running/);
    expect(() =>
      planAttemptRetry({
        attemptStatus: AttemptStatus.XRPL_SIGNED,
        requestedJobType: JobType.VALIDATE_XRPL,
        jobs: [job({ jobType: JobType.REQUEST_FDC, status: 'READY' })],
      }),
    ).toThrow(/another active job/);
  });
});

describe('admin attempt projection', () => {
  it('allowlists operational fields and excludes sensitive attempt data', () => {
    const attempt = {
      id: ATTEMPT_ID,
      paymentId: `0x${'11'.repeat(32)}`,
      status: AttemptStatus.FDC_REQUESTED,
      invoiceId: '33333333-3333-4333-8333-333333333333',
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
      updatedAt: new Date('2026-07-27T00:01:00.000Z'),
      xrplTxHash: 'A'.repeat(64),
      flareTxHash: null,
      quote: { userOpHash: `0x${'22'.repeat(32)}` },
      jobs: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          jobType: JobType.REQUEST_FDC,
          status: 'RETRY' as const,
          attempts: 2,
          nextRunAt: new Date('2026-07-27T00:02:00.000Z'),
          lastErrorCode: 'FDC_NOT_READY',
        },
      ],
      payerXrplAccount: 'rSensitive',
      personalAccount: '0xSensitive',
      failureMessage: 'provider detail must stay internal',
    };
    const projected = serializeAdminAttempt(attempt);

    expect(projected).not.toHaveProperty('payerXrplAccount');
    expect(projected).not.toHaveProperty('personalAccount');
    expect(projected).not.toHaveProperty('failureMessage');
    expect(projected.jobs[0]).not.toHaveProperty('lastError');
  });
});
