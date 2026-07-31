import { AttemptStatus, db, SettlementAsset } from '@paymorph/db';

const TERMINAL_ATTEMPT_STATUSES = new Set<AttemptStatus>([
  AttemptStatus.SETTLED,
  AttemptStatus.REJECTED,
  AttemptStatus.QUOTE_EXPIRED,
  AttemptStatus.XRPL_FAILED,
  AttemptStatus.EXECUTION_REVERTED,
  AttemptStatus.RECOVERED,
  AttemptStatus.CANCELLED,
]);

const SIGNED_OR_LATER = new Set<AttemptStatus>([
  AttemptStatus.XRPL_SIGNED,
  AttemptStatus.XRPL_VALIDATED,
  AttemptStatus.USEROP_UPLOADED,
  AttemptStatus.FDC_REQUESTED,
  AttemptStatus.FDC_READY,
  AttemptStatus.FLARE_SUBMITTED,
  AttemptStatus.FLARE_CONFIRMED,
  AttemptStatus.SETTLED,
  AttemptStatus.RECOVERY_REQUIRED,
  AttemptStatus.RECOVERED,
]);

const XRPL_VALIDATED_OR_LATER = new Set<AttemptStatus>([
  AttemptStatus.XRPL_VALIDATED,
  AttemptStatus.USEROP_UPLOADED,
  AttemptStatus.FDC_REQUESTED,
  AttemptStatus.FDC_READY,
  AttemptStatus.FLARE_SUBMITTED,
  AttemptStatus.FLARE_CONFIRMED,
  AttemptStatus.SETTLED,
  AttemptStatus.RECOVERY_REQUIRED,
  AttemptStatus.RECOVERED,
]);

const FDC_READY_OR_LATER = new Set<AttemptStatus>([
  AttemptStatus.FDC_READY,
  AttemptStatus.FLARE_SUBMITTED,
  AttemptStatus.FLARE_CONFIRMED,
  AttemptStatus.SETTLED,
  AttemptStatus.RECOVERY_REQUIRED,
  AttemptStatus.RECOVERED,
]);

interface DashboardAttempt {
  id: string;
  paymentId: string;
  status: AttemptStatus;
  payerXrplAccount: string;
  createdAt: Date;
  updatedAt: Date;
  settledAt: Date | null;
  xrplTxHash: string | null;
  flareTxHash: string | null;
  invoice: {
    id: string;
    title: string;
    settlementAsset: SettlementAsset;
  };
  quote: {
    xrplPaymentDrops: { toFixed(): string };
    invoiceOutBaseUnits: { toFixed(): string };
  };
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? Math.round((ordered[midpoint - 1]! + ordered[midpoint]!) / 2)
    : ordered[midpoint]!;
}

function volumeFor(attempts: DashboardAttempt[], asset: SettlementAsset): string {
  return attempts
    .filter((attempt) => attempt.invoice.settlementAsset === asset)
    .reduce((total, attempt) => total + BigInt(attempt.quote.invoiceOutBaseUnits.toFixed()), 0n)
    .toString();
}

function statusCount(attempts: DashboardAttempt[], accepted: Set<AttemptStatus>): number {
  return attempts.filter((attempt) => accepted.has(attempt.status)).length;
}

export interface DashboardOverview {
  periods: {
    today: DashboardPeriod;
    last7Days: DashboardPeriod;
    monthToDate: DashboardPeriod;
    allTime: DashboardPeriod;
  };
  operational: {
    pendingPayments: number;
    activeInvoices: number;
    medianSettlementSeconds: number | null;
  };
  funnel: {
    created: number;
    signed: number;
    xrplValidated: number;
    fdcReady: number;
    settled: number;
  };
  recent: DashboardRecentPayment[];
}

export interface DashboardPeriod {
  settledPayments: number;
  fxrpBaseUnits: string;
  usdt0BaseUnits: string;
}

export interface DashboardRecentPayment {
  id: string;
  paymentId: string;
  status: AttemptStatus;
  payerAlias: string;
  invoiceTitle: string;
  settlementAsset: SettlementAsset;
  xrplPaymentDrops: string;
  settlementBaseUnits: string;
  createdAt: Date;
  updatedAt: Date;
  xrplTxHash: string | null;
  flareTxHash: string | null;
}

export interface DashboardTimeseriesPoint {
  date: string;
  created: number;
  settled: number;
  fxrpBaseUnits: string;
}

function periodFor(attempts: DashboardAttempt[], since?: Date): DashboardPeriod {
  const settled = attempts.filter(
    (attempt) =>
      attempt.status === AttemptStatus.SETTLED &&
      attempt.settledAt !== null &&
      (since === undefined || attempt.settledAt >= since),
  );
  return {
    settledPayments: settled.length,
    fxrpBaseUnits: volumeFor(settled, SettlementAsset.FXRP),
    usdt0BaseUnits: volumeFor(settled, SettlementAsset.USDT0),
  };
}

export async function getDashboardOverview(merchantId: string): Promise<DashboardOverview> {
  const [attempts, activeInvoices] = await Promise.all([
    db.paymentAttempt.findMany({
      where: { invoice: { merchantId } },
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        paymentId: true,
        status: true,
        payerXrplAccount: true,
        createdAt: true,
        updatedAt: true,
        settledAt: true,
        xrplTxHash: true,
        flareTxHash: true,
        invoice: { select: { id: true, title: true, settlementAsset: true } },
        quote: { select: { xrplPaymentDrops: true, invoiceOutBaseUnits: true } },
      },
    }),
    db.invoice.count({ where: { merchantId, status: 'ACTIVE' } }),
  ]);
  const typedAttempts = attempts as DashboardAttempt[];
  const now = new Date();
  const today = startOfUtcDay(now);
  const sevenDays = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1_000);
  const durations = typedAttempts
    .filter((attempt) => attempt.status === AttemptStatus.SETTLED && attempt.settledAt !== null)
    .map((attempt) =>
      Math.max(0, Math.round((attempt.settledAt!.getTime() - attempt.createdAt.getTime()) / 1_000)),
    );

  return {
    periods: {
      today: periodFor(typedAttempts, today),
      last7Days: periodFor(typedAttempts, sevenDays),
      monthToDate: periodFor(typedAttempts, startOfUtcMonth(now)),
      allTime: periodFor(typedAttempts),
    },
    operational: {
      pendingPayments: typedAttempts.filter(
        (attempt) => !TERMINAL_ATTEMPT_STATUSES.has(attempt.status),
      ).length,
      activeInvoices,
      medianSettlementSeconds: median(durations),
    },
    funnel: {
      created: typedAttempts.length,
      signed: statusCount(typedAttempts, SIGNED_OR_LATER),
      xrplValidated: statusCount(typedAttempts, XRPL_VALIDATED_OR_LATER),
      fdcReady: statusCount(typedAttempts, FDC_READY_OR_LATER),
      settled: typedAttempts.filter((attempt) => attempt.status === AttemptStatus.SETTLED).length,
    },
    recent: typedAttempts.slice(0, 8).map((attempt) => ({
      id: attempt.id,
      paymentId: attempt.paymentId,
      status: attempt.status,
      payerAlias: `${attempt.payerXrplAccount.slice(0, 6)}…${attempt.payerXrplAccount.slice(-4)}`,
      invoiceTitle: attempt.invoice.title,
      settlementAsset: attempt.invoice.settlementAsset,
      xrplPaymentDrops: attempt.quote.xrplPaymentDrops.toFixed(),
      settlementBaseUnits: attempt.quote.invoiceOutBaseUnits.toFixed(),
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
      xrplTxHash: attempt.xrplTxHash,
      flareTxHash: attempt.flareTxHash,
    })),
  };
}

export async function getDashboardTimeseries(
  merchantId: string,
  days = 14,
): Promise<DashboardTimeseriesPoint[]> {
  const safeDays = Math.max(1, Math.min(days, 90));
  const today = startOfUtcDay(new Date());
  const start = new Date(today.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1_000);
  const attempts = await db.paymentAttempt.findMany({
    where: {
      invoice: { merchantId },
      OR: [{ createdAt: { gte: start } }, { settledAt: { gte: start } }],
    },
    select: {
      createdAt: true,
      settledAt: true,
      status: true,
      invoice: { select: { settlementAsset: true } },
      quote: { select: { invoiceOutBaseUnits: true } },
    },
  });
  const byDate = new Map<string, DashboardTimeseriesPoint>();
  for (let offset = 0; offset < safeDays; offset += 1) {
    const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1_000);
    byDate.set(date.toISOString().slice(0, 10), {
      date: date.toISOString().slice(0, 10),
      created: 0,
      settled: 0,
      fxrpBaseUnits: '0',
    });
  }
  for (const attempt of attempts) {
    const createdKey = attempt.createdAt.toISOString().slice(0, 10);
    const created = byDate.get(createdKey);
    if (created) created.created += 1;
    if (attempt.status !== AttemptStatus.SETTLED || attempt.settledAt === null) continue;
    const settledKey = attempt.settledAt.toISOString().slice(0, 10);
    const settled = byDate.get(settledKey);
    if (!settled) continue;
    settled.settled += 1;
    if (attempt.invoice.settlementAsset === SettlementAsset.FXRP) {
      settled.fxrpBaseUnits = (
        BigInt(settled.fxrpBaseUnits) + BigInt(attempt.quote.invoiceOutBaseUnits.toFixed())
      ).toString();
    }
  }
  return [...byDate.values()];
}
