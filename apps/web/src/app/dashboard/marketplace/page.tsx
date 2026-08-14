import { AttemptStatus, db } from '@paymorph/db';
import { ProductJourney } from '@/features/guides/product-journey';
import { PRODUCT_JOURNEYS } from '@/features/guides/product-journeys';
import { formatSplitPercentage } from '@/features/invoices/split-percentage';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function MarketplacePage() {
  const merchant = await requireMerchant();
  const invoices = await db.invoice.findMany({
    where: { merchantId: merchant.id },
    include: {
      recipients: { orderBy: { position: 'asc' } },
      attempts: { where: { status: AttemptStatus.SETTLED }, select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const splitInvoices = invoices.filter((invoice) => invoice.recipients.length > 1);
  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <p className="text-sm text-[var(--muted)]">Deterministic recipient settlement</p>
      <h1 className="mt-2 text-4xl font-semibold">Marketplace</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        This projection shows multi-recipient invoice splits. Funds are not held by PayMorph: the
        router distributes them only as part of a final verified settlement.
      </p>
      <div className="mt-8 space-y-4">
        {splitInvoices.length ? (
          splitInvoices.map((invoice) => (
            <article
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"
              key={invoice.id}
            >
              <div className="flex justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{invoice.title}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {invoice.attempts.length} verified settlement
                    {invoice.attempts.length === 1 ? '' : 's'}
                  </p>
                </div>
                <a
                  className="text-sm text-[var(--accent)] underline"
                  href={`/dashboard/invoices/${invoice.id}`}
                >
                  Invoice
                </a>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {invoice.recipients.map((recipient) => (
                  <li className="flex justify-between" key={recipient.id}>
                    <span>{recipient.label}</span>
                    <span>{formatSplitPercentage(recipient.bps)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-[var(--muted)]">
            Create an invoice with two or more recipient splits to see marketplace settlement
            projections.
          </div>
        )}
      </div>
      <ProductJourney journey={PRODUCT_JOURNEYS.marketplace} />
    </main>
  );
}
