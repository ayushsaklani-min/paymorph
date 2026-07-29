import { db, InvoiceStatus } from '@paymorph/db';
import { formatBaseUnits } from '@paymorph/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckoutSignIn } from '@/features/checkout/checkout-signin';

function formatBps(bps: number): string {
  return `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, '0')}%`;
}

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
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <a className="text-lg font-semibold tracking-tight" href="/">
          PayMorph
        </a>
        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
          Testnet
        </span>
      </header>

      <div className="mt-8 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
        XRPL Testnet and Flare Coston2 only. These tokens have no real monetary value.
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.7fr)]">
        <div>
          <p className="text-sm text-[var(--muted)]">Paying {invoice.merchant.displayName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {invoice.title}
          </h1>
          {invoice.description === null ? null : (
            <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">{invoice.description}</p>
          )}

          <div className="mt-8">
            <CheckoutSignIn invoiceSlug={invoice.publicSlug} />
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <p className="text-sm text-[var(--muted)]">Invoice amount</p>
          <p className="mt-2 text-3xl font-semibold">
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

          <h2 className="mt-7 text-sm font-semibold">Settlement split</h2>
          <ul className="mt-3 space-y-3">
            {invoice.recipients.map((recipient) => (
              <li className="flex items-start justify-between gap-3 text-sm" key={recipient.id}>
                <div className="min-w-0">
                  <p className="truncate">{recipient.label}</p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                    {maskAddress(recipient.address)}
                  </p>
                </div>
                <span className="shrink-0 text-[var(--muted)]">{formatBps(recipient.bps)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
