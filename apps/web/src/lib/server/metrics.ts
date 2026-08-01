import { createHash, timingSafeEqual } from 'node:crypto';
import { JobStatus, db } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';

const METRICS_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

export interface OperationalMetricsSnapshot {
  readonly attemptStatuses: readonly { readonly status: string; readonly count: number }[];
  readonly jobStatuses: readonly { readonly status: string; readonly count: number }[];
  readonly webhookDeliveryStatuses: readonly { readonly status: string; readonly count: number }[];
  readonly dueExecutorJobs: number;
}

export function requireMetricsAuthorization(
  request: Request,
  expectedToken = process.env.METRICS_TOKEN,
): void {
  if (!expectedToken || !METRICS_TOKEN.test(expectedToken)) {
    throw new DomainError('FORBIDDEN', 'Metrics endpoint is not configured');
  }
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1];
  if (!token) {
    throw new DomainError('UNAUTHENTICATED', 'Metrics authorization is required');
  }
  if (!timingSafeTokenEqual(token, expectedToken)) {
    throw new DomainError('FORBIDDEN', 'Metrics authorization is invalid');
  }
}

export async function collectOperationalMetrics(
  now = new Date(),
): Promise<OperationalMetricsSnapshot> {
  const [attempts, jobs, webhookDeliveries, dueExecutorJobs] = await Promise.all([
    db.paymentAttempt.groupBy({ by: ['status'], _count: { _all: true } }),
    db.executorJob.groupBy({ by: ['status'], _count: { _all: true } }),
    db.merchantWebhookDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
    db.executorJob.count({
      where: {
        status: { in: [JobStatus.READY, JobStatus.RETRY] },
        nextRunAt: { lte: now },
      },
    }),
  ]);

  return {
    attemptStatuses: attempts.map((row) => ({ status: row.status, count: row._count._all })),
    jobStatuses: jobs.map((row) => ({ status: row.status, count: row._count._all })),
    webhookDeliveryStatuses: webhookDeliveries.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    dueExecutorJobs,
  };
}

export function formatOperationalMetrics(snapshot: OperationalMetricsSnapshot): string {
  const lines = [
    '# HELP paymorph_payment_attempts Number of payment attempts by workflow status.',
    '# TYPE paymorph_payment_attempts gauge',
    ...formatStatusMetric('paymorph_payment_attempts', snapshot.attemptStatuses),
    '# HELP paymorph_executor_jobs Number of durable executor jobs by status.',
    '# TYPE paymorph_executor_jobs gauge',
    ...formatStatusMetric('paymorph_executor_jobs', snapshot.jobStatuses),
    '# HELP paymorph_merchant_webhook_deliveries Number of merchant webhook deliveries by status.',
    '# TYPE paymorph_merchant_webhook_deliveries gauge',
    ...formatStatusMetric('paymorph_merchant_webhook_deliveries', snapshot.webhookDeliveryStatuses),
    '# HELP paymorph_executor_jobs_due Number of ready or retry jobs scheduled at or before collection time.',
    '# TYPE paymorph_executor_jobs_due gauge',
    `paymorph_executor_jobs_due ${metricValue(snapshot.dueExecutorJobs)}`,
  ];

  return `${lines.join('\n')}\n`;
}

function formatStatusMetric(
  name: string,
  statuses: readonly { readonly status: string; readonly count: number }[],
): string[] {
  return statuses
    .map((entry) => `${name}{status="${metricLabel(entry.status)}"} ${metricValue(entry.count)}`)
    .sort();
}

function metricLabel(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 100);
  return normalized.length > 0 ? normalized : 'UNKNOWN';
}

function metricValue(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Operational metric values must be nonnegative safe integers');
  }
  return value.toString();
}

function timingSafeTokenEqual(left: string, right: string): boolean {
  return timingSafeEqual(tokenHash(left), tokenHash(right));
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
