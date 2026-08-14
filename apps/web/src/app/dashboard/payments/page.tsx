import { formatBaseUnits } from '@paymorph/shared';
import { db } from '@paymorph/db';
import { ProductJourney } from '@/features/guides/product-journey';
import { PRODUCT_JOURNEYS } from '@/features/guides/product-journeys';
import { requireMerchant } from '@/lib/server/auth/session';

function label(status: string): string {
  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tone(status: string): string {
  if (status === 'SETTLED') return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100';
  if (
    ['REJECTED', 'QUOTE_EXPIRED', 'XRPL_FAILED', 'EXECUTION_REVERTED', 'CANCELLED'].includes(status)
  ) {
    return 'border-amber-300/40 bg-amber-300/10 text-amber-100';
  }
  return 'border-sky-300/30 bg-sky-300/10 text-sky-100';
}

export default async function PaymentsPage() {
  const merchant = await requireMerchant();
  const attempts = await db.paymentAttempt.findMany({
    where: { invoice: { merchantId: merchant.id } },
    select: {
      id: true,
      paymentId: true,
      status: true,
      payerXrplAccount: true,
      createdAt: true,
      updatedAt: true,
      xrplTxHash: true,
      flareTxHash: true,
      invoice: { select: { title: true, settlementAsset: true } },
      quote: { select: { xrplPaymentDrops: true, invoiceOutBaseUnits: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <main id="main-content" tabIndex={-1} className="py-10 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="pm-kicker">Settlement operations</p>
          <h1 className="pm-display mt-4 text-4xl sm:text-5xl">Payments</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
            Follow every payment from Xaman approval to independently verified Coston2 settlement.
          </p>
        </div>
        <a
          className="pm-button pm-button-primary px-5 py-3 font-semibold"
          href="/dashboard/invoices/new"
        >
          Create invoice
        </a>
      </div>

      {attempts.length === 0 ? (
        <div className="pm-card mt-10 rounded-3xl border-dashed px-6 py-14 text-center">
          <p className="text-lg font-medium">No payment attempts yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            Attempts appear when an identified payer creates a protected quote from one of your
            invoices.
          </p>
        </div>
      ) : (
        <div className="pm-panel mt-10 overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
            <thead className="bg-white/[0.025] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-6 py-4 font-medium">Invoice</th>
                <th className="px-6 py-4 font-medium">Payer</th>
                <th className="px-6 py-4 font-medium">XRP paid</th>
                <th className="px-6 py-4 font-medium">Settlement</th>
                <th className="px-6 py-4 font-medium">Phase</th>
                <th className="px-6 py-4 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr
                  className="border-t border-[var(--line)] transition hover:bg-white/[0.02]"
                  key={attempt.id}
                >
                  <td className="px-6 py-4">
                    <a
                      className="font-medium underline-offset-4 hover:text-[var(--accent)] hover:underline"
                      href={`/dashboard/payments/${attempt.id}`}
                    >
                      {attempt.invoice.title}
                    </a>
                    <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                      {attempt.paymentId.slice(0, 16)}…
                    </p>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-[var(--muted)]">
                    {attempt.payerXrplAccount.slice(0, 6)}…{attempt.payerXrplAccount.slice(-4)}
                  </td>
                  <td className="px-6 py-4">
                    {formatBaseUnits(BigInt(attempt.quote.xrplPaymentDrops.toFixed()), 6)} XRP
                  </td>
                  <td className="px-6 py-4">
                    {formatBaseUnits(BigInt(attempt.quote.invoiceOutBaseUnits.toFixed()), 6)}{' '}
                    {attempt.invoice.settlementAsset}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone(attempt.status)}`}
                    >
                      {label(attempt.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    {attempt.xrplTxHash || attempt.flareTxHash ? (
                      <span className="font-medium text-emerald-200">Available</span>
                    ) : (
                      <span className="text-[var(--muted)]">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductJourney journey={PRODUCT_JOURNEYS.payments} />
    </main>
  );
}
