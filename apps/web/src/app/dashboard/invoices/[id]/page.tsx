import { notFound } from 'next/navigation';
import { db } from '@paymorph/db';
import { formatBaseUnits } from '@paymorph/shared';
import { requireMerchant } from '@/lib/server/auth/session';
import { InvoiceActions } from '@/features/invoices/invoice-actions';
import { formatSplitPercentage } from '@/features/invoices/split-percentage';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const merchant = await requireMerchant();
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, merchantId: merchant.id },
    include: { recipients: { orderBy: { position: 'asc' } } },
  });
  if (!invoice) notFound();

  const amount = formatBaseUnits(
    BigInt(invoice.amountBaseUnits.toFixed(0)),
    invoice.denomination === 'XRP' ? 6 : 2,
  );

  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <a className="text-sm text-[var(--muted)]" href="/dashboard/invoices">
        ← Invoices
      </a>
      <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted)]">{invoice.status}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{invoice.title}</h1>
          <p className="mt-3 text-xl">
            {amount} {invoice.denomination} → {invoice.settlementAsset}
          </p>
        </div>
        <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
      </div>
      {invoice.status === 'ACTIVE' ? (
        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <p className="text-sm text-[var(--muted)]">Public checkout</p>
          <a
            className="mt-2 block break-all text-[var(--accent)] underline"
            href={`/pay/${invoice.publicSlug}`}
          >
            /pay/{invoice.publicSlug}
          </a>
        </div>
      ) : null}
      <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold">Recipient split</h2>
        <ul className="mt-5 space-y-4">
          {invoice.recipients.map((recipient) => (
            <li
              className="flex flex-wrap justify-between gap-3 border-b border-[var(--line)] pb-4 last:border-0"
              key={recipient.id}
            >
              <div>
                <p className="font-medium">{recipient.label}</p>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">{recipient.address}</p>
              </div>
              <p>{formatSplitPercentage(recipient.bps)}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
