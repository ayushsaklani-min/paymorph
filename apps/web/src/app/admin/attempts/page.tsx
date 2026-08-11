import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ATTEMPT_STATUSES } from '@paymorph/shared';
import { listAdminAttempts, retrySafeJobType } from '@/lib/server/admin/attempts';
import { requireOperator } from '@/lib/server/auth/operator';
import { OperatorAttemptActions } from '@/features/admin/operator-attempt-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operator attempts',
  robots: { index: false, follow: false },
};

type SearchValue = string | string[] | undefined;

export default async function OperatorAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const requestHeaders = await headers();
  try {
    requireOperator(
      new Request('https://paymorph.invalid/admin/attempts', {
        headers: { cookie: requestHeaders.get('cookie') ?? '' },
      }),
    );
  } catch {
    notFound();
  }

  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['cursor', 'limit', 'status', 'olderThan'] as const) {
    const value = first(raw[key]);
    if (value !== undefined && value !== '') query.set(key, value);
  }
  const result = await listAdminAttempts(query);
  const status = first(raw.status) ?? '';
  const olderThan = first(raw.olderThan) ?? '';
  const limit = first(raw.limit) ?? '25';

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Protected operator surface
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Payment attempts
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Redacted durable state for XRPL Testnet and Coston2. Queue actions do not prove
            validation, minting, execution, or settlement.
          </p>
        </div>
        <div className="rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100">
          Testnet only · tokens have no real value
        </div>
      </header>

      <form
        className="mt-8 grid gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 md:grid-cols-[1fr_1fr_auto_auto]"
        method="get"
      >
        <label className="text-sm text-[var(--muted)]">
          Status
          <select className={fieldClass} defaultValue={status} name="status">
            <option value="">Pending and failed</option>
            {ATTEMPT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--muted)]">
          Updated before
          <input
            className={fieldClass}
            defaultValue={olderThan}
            name="olderThan"
            placeholder="2026-07-27T12:00:00.000Z"
            type="text"
          />
        </label>
        <label className="text-sm text-[var(--muted)]">
          Page size
          <select className={fieldClass} defaultValue={limit} name="limit">
            {[25, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 self-end rounded-xl bg-[var(--accent)] px-5 py-2 font-semibold text-[var(--accent-ink)]"
          type="submit"
        >
          Apply filters
        </button>
      </form>

      <section aria-live="polite" className="mt-6 space-y-5">
        {result.items.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
            No attempts match these filters.
          </div>
        ) : (
          result.items.map((attempt) => {
            const retryJob = retrySafeJobType(attempt.status);
            return (
              <article
                className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
                key={attempt.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-mono text-sm font-semibold">{attempt.id}</h2>
                      <StatusBadge status={attempt.status} />
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Invoice {attempt.invoiceId} · updated {attempt.updatedAt.toISOString()}
                    </p>
                  </div>
                  <OperatorAttemptActions
                    attemptId={attempt.id}
                    canDiagnoseRecovery={isRecoveryDiagnosable(attempt.status)}
                    retryJobType={retryJob}
                  />
                </div>

                <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  <HashValue label="Payment ID" value={attempt.paymentId} />
                  <HashValue label="XRPL transaction" value={attempt.hashes.xrplTxHash} />
                  <HashValue label="Flare transaction" value={attempt.hashes.flareTxHash} />
                  <HashValue label="User operation" value={attempt.hashes.userOpHash} />
                </dl>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-left text-xs">
                    <thead className="text-[var(--muted)]">
                      <tr>
                        <th className="pb-2 pr-4 font-medium">Job</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                        <th className="pb-2 pr-4 font-medium">Attempts</th>
                        <th className="pb-2 pr-4 font-medium">Next run</th>
                        <th className="pb-2 font-medium">Last code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempt.jobs.map((job) => (
                        <tr className="border-t border-[var(--line)]" key={job.id}>
                          <td className="py-3 pr-4 font-mono">{job.jobType}</td>
                          <td className="py-3 pr-4">{job.status}</td>
                          <td className="py-3 pr-4">{job.attempts}</td>
                          <td className="py-3 pr-4 font-mono">{job.nextRunAt.toISOString()}</td>
                          <td className="py-3 font-mono text-[var(--muted)]">
                            {job.lastErrorCode ?? '—'}
                          </td>
                        </tr>
                      ))}
                      {attempt.jobs.length === 0 ? (
                        <tr>
                          <td
                            className="border-t border-[var(--line)] py-3 text-[var(--muted)]"
                            colSpan={5}
                          >
                            No executor jobs recorded.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })
        )}
      </section>

      <nav className="mt-7 flex items-center justify-between" aria-label="Attempt pagination">
        <a
          className="text-sm text-[var(--muted)] underline underline-offset-4"
          href="/admin/attempts"
        >
          Clear filters
        </a>
        {result.nextCursor === null ? (
          <span className="text-sm text-[var(--muted)]">End of results</span>
        ) : (
          <a
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold"
            href={nextPageHref({ status, olderThan, limit, cursor: result.nextCursor })}
          >
            Next page
          </a>
        )}
      </nav>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const warning =
    status.includes('FAILED') || status.includes('REVERTED') || status === 'RECOVERY_REQUIRED';
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        warning ? 'bg-red-400/10 text-red-200' : 'bg-[var(--accent)]/10 text-[var(--accent)]'
      }`}
    >
      {status}
    </span>
  );
}

function HashValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.025] p-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-2 truncate font-mono" title={value ?? undefined}>
        {value ?? 'Not available'}
      </dd>
    </div>
  );
}

function isRecoveryDiagnosable(status: string): boolean {
  return [
    'XRPL_VALIDATED',
    'USEROP_UPLOADED',
    'FDC_REQUESTED',
    'FDC_READY',
    'FLARE_SUBMITTED',
    'FLARE_CONFIRMED',
    'SETTLED',
    'EXECUTION_REVERTED',
    'RECOVERY_REQUIRED',
  ].includes(status);
}

function nextPageHref(input: {
  status: string;
  olderThan: string;
  limit: string;
  cursor: string;
}): string {
  const query = new URLSearchParams({ cursor: input.cursor, limit: input.limit });
  if (input.status !== '') query.set('status', input.status);
  if (input.olderThan !== '') query.set('olderThan', input.olderThan);
  return `/admin/attempts?${query.toString()}`;
}

function first(value: SearchValue): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

const fieldClass =
  'mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-deep)] px-3 py-2 text-[var(--ink)]';
