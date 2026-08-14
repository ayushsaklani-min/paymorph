import { formatBaseUnits } from '@paymorph/shared';
import { ProductJourney } from '@/features/guides/product-journey';
import { PRODUCT_JOURNEYS } from '@/features/guides/product-journeys';
import { requireMerchant } from '@/lib/server/auth/session';
import { getDashboardOverview } from '@/lib/server/dashboard/overview';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3_600).toFixed(1)}h`;
}

function attemptLabel(status: string): string {
  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function attemptTone(status: string): string {
  if (status === 'SETTLED') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100';
  if (
    ['REJECTED', 'QUOTE_EXPIRED', 'XRPL_FAILED', 'EXECUTION_REVERTED', 'CANCELLED'].includes(status)
  ) {
    return 'border-amber-300/40 bg-amber-300/10 text-amber-100';
  }
  return 'border-sky-300/30 bg-sky-300/10 text-sky-100';
}

export default async function DashboardPage() {
  const merchant = await requireMerchant();
  const overview = await getDashboardOverview(merchant.id);
  const funnelMax = Math.max(overview.funnel.created, 1);

  return (
    <main id="main-content" tabIndex={-1} className="py-10 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="pm-kicker">Merchant workspace</p>
          <h1 className="pm-display mt-4 text-4xl sm:text-5xl">Settlement at a glance</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
            Track collections and evidence-backed settlement without interpreting chain logs.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            className="pm-button pm-button-secondary px-5 py-3 font-semibold text-[var(--muted-strong)]"
            href="/dashboard/payments"
          >
            View payments
          </a>
          <a
            className="pm-button pm-button-primary px-5 py-3 font-semibold text-[var(--accent-ink)]"
            href="/dashboard/invoices/new"
          >
            Create invoice
          </a>
        </div>
      </div>

      <section
        className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Revenue overview"
      >
        <MetricCard
          label="Today"
          value={`${formatBaseUnits(BigInt(overview.periods.today.fxrpBaseUnits), 6)} FXRP`}
          detail={`${overview.periods.today.settledPayments} verified settlements`}
        />
        <MetricCard
          label="Last 7 days"
          value={`${formatBaseUnits(BigInt(overview.periods.last7Days.fxrpBaseUnits), 6)} FXRP`}
          detail={`${overview.periods.last7Days.settledPayments} verified settlements`}
        />
        <MetricCard
          label="Month to date"
          value={`${formatBaseUnits(BigInt(overview.periods.monthToDate.fxrpBaseUnits), 6)} FXRP`}
          detail={`${overview.periods.monthToDate.settledPayments} verified settlements`}
        />
        <MetricCard
          label="All-time verified"
          value={`${formatBaseUnits(BigInt(overview.periods.allTime.fxrpBaseUnits), 6)} FXRP`}
          detail={`${overview.periods.allTime.settledPayments} completed payments`}
        />
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <article className="pm-panel rounded-3xl p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">Settlement funnel</p>
              <h2 className="mt-1 text-xl font-semibold">Where payments are progressing</h2>
            </div>
            <a
              className="text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
              href="/dashboard/payments"
            >
              Inspect payments
            </a>
          </div>
          <ol className="mt-7 space-y-5">
            {[
              ['Quotes created', overview.funnel.created],
              ['Xaman signed', overview.funnel.signed],
              ['XRPL validated', overview.funnel.xrplValidated],
              ['FDC evidence ready', overview.funnel.fdcReady],
              ['Settled on Coston2', overview.funnel.settled],
            ].map(([label, count]) => {
              const numericCount = Number(count);
              const width = `${Math.max(3, Math.round((numericCount / funnelMax) * 100))}%`;
              return (
                <li key={String(label)}>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span>{label}</span>
                    <span className="font-mono text-[var(--muted)]">{numericCount}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width }} />
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-7 text-xs leading-5 text-[var(--muted)]">
            Funnel stages are read-only projections. Settlement is counted only after a decoded
            `PaymentSettled` event.
          </p>
        </article>

        <article className="pm-panel rounded-3xl p-6 sm:p-7">
          <p className="text-sm font-medium text-[var(--muted)]">Operations</p>
          <h2 className="mt-1 text-xl font-semibold">What needs attention</h2>
          <dl className="mt-7 space-y-5">
            <OperationalMetric
              label="In progress"
              value={overview.operational.pendingPayments.toString()}
              detail="Payments still moving through verification"
            />
            <OperationalMetric
              label="Active invoices"
              value={overview.operational.activeInvoices.toString()}
              detail="Published checkout links available now"
            />
            <OperationalMetric
              label="Median settlement"
              value={formatDuration(overview.operational.medianSettlementSeconds)}
              detail="Created attempt to final receipt"
            />
          </dl>
          <a
            className="pm-button pm-button-secondary mt-8 inline-flex min-h-11 items-center px-4 py-2.5 text-sm font-semibold text-[var(--accent)]"
            href="/network"
          >
            Check network readiness
          </a>
        </article>
      </section>

      <section className="pm-panel mt-8 rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-5 sm:px-7">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">Recent payments</p>
            <h2 className="mt-1 text-xl font-semibold">Evidence-backed activity</h2>
          </div>
          <a
            className="text-sm font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
            href="/dashboard/payments"
          >
            View all
          </a>
        </div>
        {overview.recent.length === 0 ? (
          <div className="px-6 py-12 text-center sm:px-7">
            <p className="text-lg font-medium">No payment attempts yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
              Publish an invoice and start a payer checkout to see its verified settlement journey
              here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <thead className="bg-white/[0.025] text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-6 py-4 font-medium sm:px-7">Payment</th>
                  <th className="px-6 py-4 font-medium">Payer</th>
                  <th className="px-6 py-4 font-medium">XRP paid</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium sm:px-7">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((attempt) => (
                  <tr className="border-t border-[var(--line)]" key={attempt.id}>
                    <td className="px-6 py-4 sm:px-7">
                      <a
                        className="font-medium underline-offset-4 hover:text-[var(--accent)] hover:underline"
                        href={`/dashboard/payments/${attempt.id}`}
                      >
                        {attempt.invoiceTitle}
                      </a>
                      <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                        {attempt.paymentId.slice(0, 12)}…
                      </p>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-[var(--muted)]">
                      {attempt.payerAlias}
                    </td>
                    <td className="px-6 py-4">
                      {formatBaseUnits(BigInt(attempt.xrplPaymentDrops), 6)} XRP
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${attemptTone(attempt.status)}`}
                      >
                        {attemptLabel(attempt.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 sm:px-7">
                      {attempt.xrplTxHash || attempt.flareTxHash ? (
                        <span className="text-xs font-medium text-emerald-200">Available</span>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ProductJourney journey={PRODUCT_JOURNEYS.overview} />
    </main>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="pm-card rounded-2xl p-5 sm:p-6">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="pm-display mt-3 text-2xl tracking-[-0.045em]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
    </article>
  );
}

function OperationalMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-5 last:border-0 last:pb-0">
      <div>
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</dd>
      </div>
      <dd className="shrink-0 text-xl font-semibold">{value}</dd>
    </div>
  );
}
