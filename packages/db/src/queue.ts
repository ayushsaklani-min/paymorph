import { Prisma, type ExecutorJob, type JobType } from '../generated/client/index.js';
import { db } from './index.js';

export interface ClaimJobsInput {
  workerId: string;
  limit?: number;
  leaseMs?: number;
  jobTypes?: readonly JobType[];
}

export async function claimDueJobs({
  workerId,
  limit = 10,
  leaseMs = 60_000,
  jobTypes,
}: ClaimJobsInput): Promise<ExecutorJob[]> {
  if (!workerId || limit < 1 || limit > 100 || leaseMs < 5_000) {
    throw new RangeError('Invalid job claim parameters');
  }
  const lockedUntil = new Date(Date.now() + leaseMs);
  const typeFilter =
    jobTypes && jobTypes.length > 0
      ? Prisma.sql`AND "jobType" IN (${Prisma.join(
          jobTypes.map((type) => Prisma.sql`${type}::"JobType"`),
        )})`
      : Prisma.empty;

  return db.$queryRaw<ExecutorJob[]>(Prisma.sql`
    WITH candidate AS (
      SELECT id
      FROM "ExecutorJob"
      WHERE status IN ('READY'::"JobStatus", 'RETRY'::"JobStatus")
        AND "nextRunAt" <= NOW()
        AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())
        ${typeFilter}
      ORDER BY "nextRunAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "ExecutorJob" AS job
    SET status = 'RUNNING'::"JobStatus",
        "lockedBy" = ${workerId},
        "lockedUntil" = ${lockedUntil},
        attempts = attempts + 1,
        "updatedAt" = NOW()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  `);
}

export async function completeJob(jobId: string, workerId: string): Promise<void> {
  const result = await db.executorJob.updateMany({
    where: { id: jobId, status: 'RUNNING', lockedBy: workerId },
    data: {
      status: 'SUCCEEDED',
      lockedBy: null,
      lockedUntil: null,
      lastErrorCode: null,
      lastError: null,
    },
  });
  if (result.count !== 1) throw new Error('Job lease was lost before completion');
}

export async function retryJob(input: {
  jobId: string;
  workerId: string;
  errorCode: string;
  errorMessage: string;
  nextRunAt: Date;
}): Promise<void> {
  await db.$transaction(async (transaction) => {
    const job = await transaction.executorJob.findUnique({ where: { id: input.jobId } });
    if (!job || job.status !== 'RUNNING' || job.lockedBy !== input.workerId) {
      throw new Error('Job lease was lost before retry scheduling');
    }
    const exhausted = job.attempts >= job.maxAttempts;
    await transaction.executorJob.update({
      where: { id: job.id },
      data: {
        status: exhausted ? 'DEAD' : 'RETRY',
        nextRunAt: input.nextRunAt,
        lockedBy: null,
        lockedUntil: null,
        lastErrorCode: input.errorCode,
        lastError: input.errorMessage.slice(0, 2_000),
      },
    });
  });
}
