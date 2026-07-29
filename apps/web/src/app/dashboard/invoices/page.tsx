import { db } from '@paymorph/db';
import { formatBaseUnits } from '@paymorph/shared';
import { requireMerchant } from '@/lib/server/auth/session';

export default async function InvoicesPage() {
  const merchant = await requireMerchant();
  const invoices = await db.invoice.findMany({
    where: { merchantId: merchant.id },
    include: { _count: { select: { attempts: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm text-[var(--muted)]">Merchant workspace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Invoices</h1>
        </div>
        <a
          className="rounded-full bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-ink)]"
          href="/dashboard/invoices/new"
        >
          New invoice
        </a>
      </div>

      {invoices.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[var(--line)] p-10 text-center">
          <p className="text-lg font-medium">No invoices yet.</p>
          <p className="mt-2 text-[var(--muted)]">Create a testnet payment link to get started.</p>
        </div>
      ) : (
        <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--line)]">
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
    </main>
  );
}
