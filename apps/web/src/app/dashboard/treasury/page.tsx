import { AttemptStatus, db } from '@paymorph/db';
import { formatBaseUnits } from '@paymorph/shared';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function TreasuryPage() {
  const merchant = await requireMerchant();
  const attempts = await db.paymentAttempt.findMany({
    where: { status: AttemptStatus.SETTLED, invoice: { merchantId: merchant.id } },
    include: {
      invoice: { select: { settlementAsset: true } },
      quote: { select: { invoiceOutBaseUnits: true } },
    },
    orderBy: { settledAt: 'desc' },
    take: 50,
  });
  const fxrp = attempts
    .filter((attempt) => attempt.invoice.settlementAsset === 'FXRP')
    .reduce((sum, attempt) => sum + BigInt(attempt.quote.invoiceOutBaseUnits.toFixed(0)), 0n);
  const usdt0 = attempts
    .filter((attempt) => attempt.invoice.settlementAsset === 'USDT0')
    .reduce((sum, attempt) => sum + BigInt(attempt.quote.invoiceOutBaseUnits.toFixed(0)), 0n);
  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <p className="text-sm text-[var(--muted)]">Read-only settlement projection</p>
      <h1 className="mt-2 text-4xl font-semibold">Treasury</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        This is not a wallet balance. It is the amount evidenced by decoded final `PaymentSettled`
        events for this merchant’s invoices.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Metric label="FXRP settled" value={formatBaseUnits(fxrp, 6)} />
        <Metric label="USDT0 settled" value={formatBaseUnits(usdt0, 6)} />
      </div>
      <section className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-[var(--muted)]">
            <tr>
              <th className="p-4">Payment</th>
              <th className="p-4">Asset</th>
              <th className="p-4">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt) => (
              <tr className="border-t border-[var(--line)]" key={attempt.id}>
                <td className="p-4 font-mono">{attempt.paymentId.slice(0, 14)}…</td>
                <td className="p-4">{attempt.invoice.settlementAsset}</td>
                <td className="p-4">
                  <a className="text-[var(--accent)] underline" href={`/receipts/${attempt.id}`}>
                    Receipt
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
