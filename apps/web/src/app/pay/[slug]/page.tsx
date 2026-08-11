import { db, InvoiceStatus } from '@paymorph/db';
import { formatBaseUnits } from '@paymorph/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckoutSignIn } from '@/features/checkout/checkout-signin';
import { formatSplitPercentage } from '@/features/invoices/split-percentage';

function maskAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const metadata: Metadata = {
  title: 'Secure testnet checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const invoice = await db.invoice.findUnique({
    where: { publicSlug: slug },
    include: {
      merchant: { select: { displayName: true } },
      recipients: { orderBy: { position: 'asc' } },
    },
  });
  if (
    invoice === null ||
    invoice.status !== InvoiceStatus.ACTIVE ||
    invoice.expiresAt <= new Date()
  ) {
    notFound();
  }

  const amount = formatBaseUnits(
    BigInt(invoice.amountBaseUnits.toFixed(0)),
    invoice.denomination === 'XRP' ? 6 : 2,
  );

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="pm-shell mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10"
    >
      <header className="pm-panel pm-editorial-nav flex items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:px-5">
        <a className="flex items-center gap-2.5" href="/">
          <span className="pm-logo-compact grid size-7 place-items-center rounded-lg border text-xs font-black">
            P
          </span>
          <span className="text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
        </a>
        <span className="pm-data rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          Testnet
        </span>
      </header>

      <div className="mt-6 rounded-2xl border border-[var(--accent)]/15 bg-[var(--accent)]/[0.045] px-4 py-3 text-sm leading-6 text-[var(--muted-strong)]">
        XRPL Testnet and Flare Coston2 only. These tokens have no real monetary value.
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.7fr)]">
        <div>
          <p className="pm-kicker">Paying {invoice.merchant.displayName}</p>
          <h1 className="pm-display mt-4 text-4xl sm:text-5xl">{invoice.title}</h1>
          {invoice.description === null ? null : (
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">{invoice.description}</p>
          )}

          <div className="mt-8">
            <CheckoutSignIn invoiceSlug={invoice.publicSlug} />
          </div>
        </div>

        <aside className="pm-panel h-fit rounded-3xl p-5 sm:p-6">
          <p className="pm-kicker">Invoice amount</p>
          <p className="pm-display mt-4 text-4xl">
            {amount} <span className="text-lg">{invoice.denomination}</span>
          </p>
          <dl className="mt-6 space-y-4 border-t border-[var(--line)] pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Merchant receives</dt>
              <dd className="font-medium">{invoice.settlementAsset}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Networks</dt>
              <dd className="text-right font-medium">XRPL Testnet → Coston2</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted)]">Expires</dt>
              <dd className="text-right font-medium">
                {invoice.expiresAt.toLocaleString('en', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'UTC',
                })}{' '}
                UTC
              </dd>
            </div>
          </dl>

          <h2 className="pm-display mt-7 text-lg tracking-[-0.03em]">Settlement split</h2>
          <ul className="mt-3 space-y-3">
            {invoice.recipients.map((recipient) => (
              <li className="flex items-start justify-between gap-3 text-sm" key={recipient.id}>
                <div className="min-w-0">
                  <p className="truncate">{recipient.label}</p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                    {maskAddress(recipient.address)}
                  </p>
                </div>
                <span className="shrink-0 text-[var(--muted)]">
                  {formatSplitPercentage(recipient.bps)}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
