import { db } from '@paymorph/db';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function DashboardPage() {
  const merchant = await requireMerchant();
  const [invoiceCount, settledCount] = await Promise.all([
    db.invoice.count({ where: { merchantId: merchant.id } }),
    db.paymentAttempt.count({
      where: { invoice: { merchantId: merchant.id }, status: 'SETTLED' },
    }),
  ]);
  return (
    <main className="py-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted)]">Merchant overview</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Good to see you.</h1>
        </div>
        <a
          className="rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)]"
          href="/dashboard/invoices/new"
        >
          New invoice
        </a>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ['Invoices', invoiceCount.toString()],
          ['Settled payments', settledCount.toString()],
          ['Network', 'Coston2'],
        ].map(([label, value]) => (
          <article
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"
            key={label}
          >
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
