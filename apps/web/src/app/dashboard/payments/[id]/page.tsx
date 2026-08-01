import { notFound } from 'next/navigation';
import { formatBaseUnits } from '@paymorph/shared';
import { db } from '@paymorph/db';
import { requireMerchant } from '@/lib/server/auth/session';

const STAGES = [
  [
    'Xaman',
    [
      'AWAITING_SIGNATURE',
      'XRPL_SIGNED',
      'XRPL_VALIDATED',
      'USEROP_UPLOADED',
      'FDC_REQUESTED',
      'FDC_READY',
      'FLARE_SUBMITTED',
      'FLARE_CONFIRMED',
      'SETTLED',
    ],
  ],
  [
    'XRPL Testnet',
    [
      'XRPL_VALIDATED',
      'USEROP_UPLOADED',
      'FDC_REQUESTED',
      'FDC_READY',
      'FLARE_SUBMITTED',
      'FLARE_CONFIRMED',
      'SETTLED',
    ],
  ],
  ['Flare Data Connector', ['FDC_READY', 'FLARE_SUBMITTED', 'FLARE_CONFIRMED', 'SETTLED']],
  ['Coston2 settlement', ['SETTLED']],
] as const;

function label(status: string): string {
  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function MerchantPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const merchant = await requireMerchant();
  const { id } = await params;
  const attempt = await db.paymentAttempt.findFirst({
    where: { id, invoice: { merchantId: merchant.id } },
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
      failureCode: true,
      failureMessage: true,
      invoice: { select: { id: true, title: true, settlementAsset: true, publicSlug: true } },
      quote: { select: { xrplPaymentDrops: true, invoiceOutBaseUnits: true } },
      fdcRequest: { select: { status: true, votingRoundId: true } },
      chainEvents: {
        select: { eventName: true, txHash: true, logIndex: true },
        orderBy: { logIndex: 'asc' },
      },
    },
  });
  if (!attempt) notFound();

  return (
    <main id="main-content" tabIndex={-1} className="py-10 sm:py-12">
      <a
        className="text-sm font-medium text-[var(--muted)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
        href="/dashboard/payments"
      >
        ← Payments
      </a>
      <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">Payment detail</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{attempt.invoice.title}</h1>
          <p className="mt-3 font-mono text-xs text-[var(--muted)]">{attempt.paymentId}</p>
        </div>
        {attempt.status === 'SETTLED' ? (
          <a
            className="rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)]"
            href={`/receipt/${attempt.id}`}
          >
            View verified receipt
          </a>
        ) : (
          <a
            className="rounded-full border border-[var(--line)] px-5 py-3 font-semibold text-[var(--muted)]"
            href={`/pay/${attempt.invoice.publicSlug}`}
          >
            Open checkout
          </a>
        )}
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <DetailCard
          label="Payer paid"
          value={`${formatBaseUnits(BigInt(attempt.quote.xrplPaymentDrops.toFixed()), 6)} XRP`}
        />
        <DetailCard
          label="Merchant settlement"
          value={`${formatBaseUnits(BigInt(attempt.quote.invoiceOutBaseUnits.toFixed()), 6)} ${attempt.invoice.settlementAsset}`}
        />
        <DetailCard label="Current phase" value={label(attempt.status)} />
      </section>

      <section className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
        <p className="text-sm font-medium text-[var(--muted)]">Evidence timeline</p>
        <h2 className="mt-1 text-xl font-semibold">Verified settlement progress</h2>
        <ol className="mt-7 grid gap-3 sm:grid-cols-4">
          {STAGES.map(([name, statuses], index) => {
            const reached = statuses.includes(attempt.status as never);
            return (
              <li
                className={`rounded-xl border p-4 ${reached ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-[var(--line)] bg-black/10'}`}
                key={name}
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs font-bold ${reached ? 'bg-emerald-300 text-emerald-950' : 'border border-[var(--line)] text-[var(--muted)]'}`}
                >
                  {reached ? '✓' : index + 1}
                </span>
                <p className="mt-3 text-sm font-semibold">{name}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  {reached
                    ? 'Evidence available or this stage is complete.'
                    : 'Waiting for the previous verified stage.'}
                </p>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-sm leading-6 text-[var(--muted)]">
          {attempt.status === 'SETTLED'
            ? 'The final router event has been decoded and the public receipt is available.'
            : 'This workflow remains in progress until its required external evidence is independently verified.'}
        </p>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-lg font-semibold">Payment evidence</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <EvidenceRow label="Payer account" value={attempt.payerXrplAccount} mono />
            <EvidenceRow
              label="FDC request"
              value={attempt.fdcRequest?.status ?? 'Not requested'}
            />
            <EvidenceRow
              label="FDC voting round"
              value={attempt.fdcRequest?.votingRoundId?.toString() ?? 'Pending'}
            />
            <EvidenceRow
              label="Decoded chain events"
              value={attempt.chainEvents.length.toString()}
            />
          </dl>
        </article>
        <article className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-lg font-semibold">Explorer records</h2>
          <div className="mt-5 space-y-3">
            {attempt.xrplTxHash ? (
              <a
                className="block break-all rounded-xl border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--accent)] underline underline-offset-4"
                href={`https://testnet.xrpl.org/transactions/${attempt.xrplTxHash}`}
                rel="noreferrer"
                target="_blank"
              >
                XRPL: {attempt.xrplTxHash}
              </a>
            ) : null}
            {attempt.flareTxHash ? (
              <a
                className="block break-all rounded-xl border border-[var(--line)] px-3 py-2 font-mono text-xs text-[var(--accent)] underline underline-offset-4"
                href={`https://coston2-explorer.flare.network/tx/${attempt.flareTxHash}`}
                rel="noreferrer"
                target="_blank"
              >
                Coston2: {attempt.flareTxHash}
              </a>
            ) : null}
            {!attempt.xrplTxHash && !attempt.flareTxHash ? (
              <p className="text-sm leading-6 text-[var(--muted)]">
                Explorer links appear as each transaction is independently verified.
              </p>
            ) : null}
          </div>
        </article>
      </section>

      {attempt.failureMessage ? (
        <section className="mt-8 rounded-3xl border border-amber-300/40 bg-amber-300/10 p-6">
          <p className="text-sm font-semibold text-amber-100">Workflow detail</p>
          <p className="mt-2 text-sm leading-6 text-amber-50">{attempt.failureMessage}</p>
        </section>
      ) : null}
    </main>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </article>
  );
}

function EvidenceRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={`max-w-full break-all text-right ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
