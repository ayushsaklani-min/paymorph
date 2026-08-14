import { db } from '@paymorph/db';
import { formatBaseUnits } from '@paymorph/shared';
import { ProductJourney } from '@/features/guides/product-journey';
import { PRODUCT_JOURNEYS } from '@/features/guides/product-journeys';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function InvoicesPage() {
  const merchant = await requireMerchant();
  const invoices = await db.invoice.findMany({
    where: { merchantId: merchant.id },
    include: { _count: { select: { attempts: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="pm-kicker">Merchant workspace</p>
          <h1 className="pm-display mt-4 text-4xl sm:text-5xl">Invoices</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            className="pm-button pm-button-secondary px-5 py-3 font-semibold text-[var(--muted-strong)]"
            href="/dashboard/invoices/templates"
          >
            Templates
          </a>
          <a
            className="pm-button pm-button-primary px-5 py-3 font-semibold"
            href="/dashboard/invoices/new"
          >
            New invoice
          </a>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="pm-card mt-10 rounded-3xl border-dashed p-10 text-center">
          <p className="text-lg font-medium">No invoices yet.</p>
          <p className="mt-2 text-[var(--muted)]">Create a testnet payment link to get started.</p>
        </div>
      ) : (
        <div className="pm-panel mt-10 overflow-hidden rounded-3xl">
          <table className="w-full border-collapse text-left">
            <thead className="bg-white/[0.035] text-sm text-[var(--muted)]">
              <tr>
                <th className="px-5 py-4">Invoice</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Settlement</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr className="border-t border-[var(--line)]" key={invoice.id}>
                  <td className="px-5 py-4">
                    <a
                      className="font-medium underline-offset-4 hover:underline"
                      href={`/dashboard/invoices/${invoice.id}`}
                    >
                      {invoice.title}
                    </a>
                  </td>
                  <td className="px-5 py-4">
                    {formatBaseUnits(
                      BigInt(invoice.amountBaseUnits.toFixed(0)),
                      invoice.denomination === 'XRP' ? 6 : 2,
                    )}{' '}
                    {invoice.denomination}
                  </td>
                  <td className="px-5 py-4">{invoice.settlementAsset}</td>
                  <td className="px-5 py-4">{invoice.status}</td>
                  <td className="px-5 py-4">{invoice._count.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductJourney journey={PRODUCT_JOURNEYS.invoices} />
    </main>
  );
}
