import {
  AttemptStatus,
  db,
  JobType,
  Prisma,
  type ExecutorJob,
  type JobStatus,
  type PaymentAttempt,
} from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_TRANSACTION_RETRIES = 3;
const DEFAULT_EXCLUDED_STATUSES: AttemptStatus[] = [
  AttemptStatus.SETTLED,
  AttemptStatus.REJECTED,
  AttemptStatus.QUOTE_EXPIRED,
  AttemptStatus.RECOVERED,
  AttemptStatus.CANCELLED,
];

const listQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_LIMIT))
    .optional(),
  status: z
    .enum([
      'CREATED',
      'IDENTIFYING',
      'IDENTIFIED',
      'QUOTED',
      'XAMAN_CREATED',
      'AWAITING_SIGNATURE',
      'XRPL_SIGNED',
      'XRPL_VALIDATED',
      'USEROP_UPLOADED',
      'FDC_REQUESTED',
      'FDC_READY',
      'FLARE_SUBMITTED',
      'FLARE_CONFIRMED',
      'SETTLED',
      'REJECTED',
      'QUOTE_EXPIRED',
      'XRPL_FAILED',
      'EXECUTION_REVERTED',
      'RECOVERY_REQUIRED',
      'RECOVERED',
      'CANCELLED',
    ])
    .optional(),
  olderThan: z.iso.datetime().optional(),
});

const cursorSchema = z.strictObject({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  id: z.uuid(),
});

export const retryAttemptSchema = z.strictObject({
  jobType: z.enum([
    'VALIDATE_XRPL',
    'REQUEST_FDC',
    'SUBMIT_FLARE',
    'INDEX_EVENTS',
    'RECONCILE',
    'RECOVERY_DIAGNOSIS',
  ]),
});

type AdminCursor = { updatedAt: Date; id: string };

export interface AdminAttemptListQuery {
  cursor: AdminCursor | null;
  limit: number;
  status?: AttemptStatus;
  olderThan?: Date;
}

interface RetryJobSnapshot {
  id: string;
  jobType: JobType;
  generation: number;
  status: JobStatus;
  nextRunAt: Date;
}

type RetryPlan =
  | { kind: 'existing'; job: RetryJobSnapshot }
  | { kind: 'reactivate'; job: RetryJobSnapshot }
  | { kind: 'create'; generation: number };

export function parseAdminAttemptListQuery(searchParams: URLSearchParams): AdminAttemptListQuery {
  const values: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (values[key] !== undefined) {
      throw new DomainError('VALIDATION_ERROR', `Query parameter "${key}" must appear once`);
    }
    values[key] = value;
  }

  const parsed = listQuerySchema.parse(values);
  return {
    cursor: parsed.cursor === undefined ? null : decodeAdminAttemptCursor(parsed.cursor),
    limit: parsed.limit ?? DEFAULT_LIMIT,
    ...(parsed.status === undefined ? {} : { status: AttemptStatus[parsed.status] }),
    ...(parsed.olderThan === undefined ? {} : { olderThan: new Date(parsed.olderThan) }),
  };
}

export function encodeAdminAttemptCursor(
  attempt: Pick<PaymentAttempt, 'id' | 'updatedAt'>,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      updatedAt: attempt.updatedAt.toISOString(),
      id: attempt.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeAdminAttemptCursor(value: string): AdminCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Cursor is not base64url');
    const payload = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    const cursor = { updatedAt: new Date(payload.updatedAt), id: payload.id };
    if (encodeAdminAttemptCursor(cursor) !== value) throw new Error('Cursor is not canonical');
    return cursor;
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Admin attempt cursor is invalid');
  }
}

export async function listAdminAttempts(searchParams: URLSearchParams) {
  const query = parseAdminAttemptListQuery(searchParams);
  const cursorFilter: Prisma.PaymentAttemptWhereInput =
    query.cursor === null
      ? {}
      : {
          OR: [
            { updatedAt: { lt: query.cursor.updatedAt } },
            { updatedAt: query.cursor.updatedAt, id: { lt: query.cursor.id } },
          ],
        };

  const attempts = await db.paymentAttempt.findMany({
    where: {
      ...cursorFilter,
      ...(query.status === undefined
        ? { status: { notIn: DEFAULT_EXCLUDED_STATUSES } }
        : { status: query.status }),
      ...(query.olderThan === undefined ? {} : { updatedAt: { lt: query.olderThan } }),
    },
    select: {
      id: true,
      paymentId: true,
      status: true,
      invoiceId: true,
      createdAt: true,
      updatedAt: true,
      xrplTxHash: true,
      flareTxHash: true,
      quote: { select: { userOpHash: true } },
      jobs: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          id: true,
          jobType: true,
          status: true,
          attempts: true,
          nextRunAt: true,
          lastErrorCode: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });

  const hasNextPage = attempts.length > query.limit;
  const page = hasNextPage ? attempts.slice(0, query.limit) : attempts;
  const lastAttempt = page.at(-1);
  return {
    items: page.map(serializeAdminAttempt),
    nextCursor:
      hasNextPage && lastAttempt !== undefined ? encodeAdminAttemptCursor(lastAttempt) : null,
  };
}

export function retrySafeJobType(
  status: AttemptStatus,
  hasConfirmedFlareCheckpoint = false,
): JobType | null {
  switch (status) {
    case AttemptStatus.XRPL_SIGNED:
      return JobType.VALIDATE_XRPL;
    case AttemptStatus.XRPL_VALIDATED:
    case AttemptStatus.FDC_REQUESTED:
      return JobType.REQUEST_FDC;
    case AttemptStatus.FDC_READY:
      return JobType.SUBMIT_FLARE;
    case AttemptStatus.FLARE_SUBMITTED:
      return hasConfirmedFlareCheckpoint ? JobType.SUBMIT_FLARE : null;
    case AttemptStatus.FLARE_CONFIRMED:
      return JobType.INDEX_EVENTS;
    default:
      return null;
  }
}

export function planAttemptRetry(input: {
  attemptStatus: AttemptStatus;
  requestedJobType: JobType;
  jobs: RetryJobSnapshot[];
  hasConfirmedFlareCheckpoint?: boolean;
}): RetryPlan {
  const allowed = retrySafeJobType(input.attemptStatus, input.hasConfirmedFlareCheckpoint ?? false);
  if (allowed === null || allowed !== input.requestedJobType) {
    throw new DomainError(
      'IDEMPOTENCY_CONFLICT',
      `Attempt ${input.attemptStatus} is not retry-safe for ${input.requestedJobType}`,
    );
  }

  const active = input.jobs.filter((job) => ['READY', 'RUNNING', 'RETRY'].includes(job.status));
  if (active.some((job) => job.status === 'RUNNING')) {
    throw new DomainError('IDEMPOTENCY_CONFLICT', 'Attempt already has a running job');
  }
  if (active.some((job) => job.jobType !== allowed) || active.length > 1) {
    throw new DomainError(
      'IDEMPOTENCY_CONFLICT',
      'Attempt has another active job; reconcile it before retrying',
    );
  }
  const current = active[0];
  if (current !== undefined) {
    return current.status === 'READY'
      ? { kind: 'existing', job: current }
      : { kind: 'reactivate', job: current };
  }

  const latestGeneration = input.jobs
    .filter((job) => job.jobType === allowed)
    .reduce((maximum, job) => Math.max(maximum, job.generation), -1);
  return { kind: 'create', generation: latestGeneration + 1 };
}

export async function retryAttemptJob(input: {
  attemptId: string;
  requestedJobType: JobType;
  operatorId: string;
  now?: Date;
}) {
  for (let retry = 0; retry < MAX_TRANSACTION_RETRIES; retry += 1) {
    try {
      return await retryAttemptJobTransaction(input);
    } catch (error) {
      if (retry + 1 < MAX_TRANSACTION_RETRIES && isTransactionConflict(error)) continue;
      throw error;
    }
  }
  throw new DomainError('INTERNAL_ERROR', 'Unable to enqueue retry');
}

function retryAttemptJobTransaction(input: {
  attemptId: string;
  requestedJobType: JobType;
  operatorId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(
    async (transaction) => {
      const attempt = await transaction.paymentAttempt.findUnique({
        where: { id: input.attemptId },
        select: {
          id: true,
          status: true,
          jobs: {
            orderBy: [{ generation: 'desc' }, { createdAt: 'desc' }],
            select: {
              id: true,
              jobType: true,
              generation: true,
              status: true,
              nextRunAt: true,
            },
          },
          flareSubmissions: {
            where: { status: 'CONFIRMED' },
            orderBy: { submittedAt: 'desc' },
            select: { receiptJson: true },
            take: 1,
          },
        },
      });
      if (attempt === null) {
        throw new DomainError('VALIDATION_ERROR', 'Payment attempt not found');
      }

      const plan = planAttemptRetry({
        attemptStatus: attempt.status,
        requestedJobType: input.requestedJobType,
        jobs: attempt.jobs,
        hasConfirmedFlareCheckpoint:
          attempt.flareSubmissions[0]?.receiptJson !== null &&
          isReadyFlareCheckpoint(attempt.flareSubmissions[0]?.receiptJson),
      });
      if (plan.kind === 'existing') return serializeJobRetry(plan.job, attempt.id);

      const job =
        plan.kind === 'reactivate'
          ? await transaction.executorJob.update({
              where: { id: plan.job.id },
              data: {
                status: 'READY',
                nextRunAt: now,
                lockedBy: null,
                lockedUntil: null,
              },
            })
          : await transaction.executorJob.create({
              data: {
                attemptId: attempt.id,
                jobType: input.requestedJobType,
                generation: plan.generation,
                status: 'READY',
                nextRunAt: now,
              },
            });

      await transaction.auditLog.create({
        data: {
          actorType: 'OPERATOR',
          actorId: input.operatorId,
          action: 'ATTEMPT_JOB_RETRY',
          entityType: 'PaymentAttempt',
          entityId: attempt.id,
          metadata: {
            jobId: job.id,
            jobType: job.jobType,
            generation: job.generation,
          },
        },
      });
      return serializeJobRetry(job, attempt.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function serializeAdminAttempt(attempt: {
  id: string;
  paymentId: string;
  status: AttemptStatus;
  invoiceId: string;
  createdAt: Date;
  updatedAt: Date;
  xrplTxHash: string | null;
  flareTxHash: string | null;
  quote: { userOpHash: string };
  jobs: Array<{
    id: string;
    jobType: JobType;
    status: JobStatus;
    attempts: number;
    nextRunAt: Date;
    lastErrorCode: string | null;
  }>;
}) {
  return {
    id: attempt.id,
    paymentId: attempt.paymentId,
    status: attempt.status,
    invoiceId: attempt.invoiceId,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    hashes: {
      xrplTxHash: attempt.xrplTxHash,
      flareTxHash: attempt.flareTxHash,
      userOpHash: attempt.quote.userOpHash,
    },
    jobs: attempt.jobs.map((job) => ({
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      attempts: job.attempts,
      nextRunAt: job.nextRunAt,
      lastErrorCode: job.lastErrorCode,
    })),
  };
}

function serializeJobRetry(
  job: Pick<ExecutorJob, 'id' | 'jobType' | 'nextRunAt'>,
  attemptId: string,
) {
  return {
    jobId: job.id,
    attemptId,
    jobType: job.jobType,
    status: 'READY' as const,
    nextRunAt: job.nextRunAt,
  };
}

function isTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}

function isReadyFlareCheckpoint(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'outcome' in value &&
    value.outcome === 'READY'
  );
}
