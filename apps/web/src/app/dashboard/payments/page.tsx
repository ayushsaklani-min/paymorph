import { db } from '@paymorph/db';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function PaymentsPage() {
  const merchant = await requireMerchant();
  const attempts = await db.paymentAttempt.findMany({
    where: { invoice: { merchantId: merchant.id } },
    include: { invoice: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <main className="py-12">
      <p className="text-sm text-[var(--muted)]">Cross-chain history</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Payments</h1>
      {attempts.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--line)] p-10 text-center">
          <p className="text-lg font-medium">No payment attempts yet.</p>
          <p className="mt-2 text-[var(--muted)]">
            Attempts appear after an identified payer creates a quote.
          </p>
        </div>
      ) : (
        <div className="mt-10 space-y-3">
          {attempts.map((attempt) => (
            <a
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
              href={`/receipt/${attempt.id}`}
              key={attempt.id}
            >
              <div>
                <p className="font-medium">{attempt.invoice.title}</p>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">{attempt.paymentId}</p>
              </div>
              <span>{attempt.status}</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
