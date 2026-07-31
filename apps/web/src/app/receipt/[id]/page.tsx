import { notFound } from 'next/navigation';
import { TestnetNotice } from '@paymorph/ui';
import { buildPublicReceipt } from '@/lib/server/receipts/service';

export const dynamic = 'force-dynamic';

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await buildPublicReceipt(id).catch(() => null);
  if (!receipt) notFound();

  return (
    <main className="pm-shell mx-auto min-h-screen max-w-4xl px-6 py-6 sm:py-10">
      <header className="pm-panel flex items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:px-5">
        <a className="flex items-center gap-2.5" href="/">
          <span className="grid size-7 place-items-center rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/10 text-xs font-black text-[var(--accent)]">
            P
          </span>
          <span className="text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
        </a>
        <span className="pm-data rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          Verified receipt
        </span>
      </header>
      <div className="pm-panel mt-8 rounded-[2rem] p-7 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="pm-kicker">Payment settled</p>
            <h1 className="pm-display mt-4 text-4xl sm:text-5xl">{receipt.invoice.title}</h1>
            <p className="mt-3 text-[var(--muted)]">{receipt.invoice.merchant.displayName}</p>
          </div>
          <span className="pm-data rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-2 text-xs font-bold text-[var(--accent)]">
            {receipt.settlement.asset}
          </span>
        </div>

        <TestnetNotice className="mt-8 rounded-2xl border border-[var(--accent)]/15 bg-[var(--accent)]/[0.045] p-4 text-sm text-[var(--muted)]" />

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Evidence label="XRPL payment">
            <p>{receipt.sourcePayment.xrpDisplay} XRP</p>
            <a
              className="mt-2 block break-all text-sm text-[var(--accent)] underline"
              href={receipt.sourcePayment.explorerUrl}
            >
              {receipt.sourcePayment.txHash}
            </a>
          </Evidence>
          <Evidence label="Coston2 settlement">
            <p>
              {receipt.settlement.invoiceAmount} base units + {receipt.settlement.serviceFee} fee
            </p>
            <a
              className="mt-2 block break-all text-sm text-[var(--accent)] underline"
              href={receipt.settlement.explorerUrl}
            >
              {receipt.settlement.flareTxHash}
            </a>
          </Evidence>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Recipient evidence</h2>
          <ul className="mt-4 space-y-3">
            {receipt.recipients.map((recipient) => (
              <li
                className="pm-card flex flex-wrap justify-between gap-4 rounded-2xl p-4"
                key={recipient.address}
              >
                <div>
                  <p className="font-medium">{recipient.label}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">{recipient.address}</p>
                </div>
                <p>{recipient.amount} base units</p>
              </li>
            ))}
          </ul>
        </section>

        <dl className="mt-8 grid gap-4 border-t border-[var(--line)] pt-8 text-sm sm:grid-cols-2">
          <Detail label="Payment ID" value={receipt.paymentId} />
          <Detail label="User operation hash" value={receipt.protocol.userOpHash} />
          <Detail label="Personal account" value={receipt.protocol.personalAccount} />
          <Detail label="Router" value={receipt.settlement.routerAddress} />
        </dl>
      </div>
    </main>
  );
}

function Evidence({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <article className="pm-card rounded-3xl p-5">
      <h2 className="mb-3 text-sm text-[var(--muted)]">{label}</h2>
      {children}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs">{value}</dd>
    </div>
  );
}
