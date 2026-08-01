import { notFound } from 'next/navigation';
import { buildPublicReceipt } from '@/lib/server/receipts/service';

export default async function ReceiptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const receipt = await buildPublicReceipt((await params).attemptId);
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="pm-shell mx-auto min-h-screen max-w-3xl px-4 py-8 sm:py-12"
      >
        <header className="pm-panel pm-editorial-nav flex items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:px-5">
          <a className="flex items-center gap-2.5" href="/">
            <span className="pm-logo-compact grid size-7 place-items-center rounded-lg border text-xs font-black">
              P
            </span>
            <span className="text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
          </a>
          <span className="pm-data rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            Verified receipt
          </span>
        </header>
        <section className="pm-panel mt-8 rounded-[2rem] p-6 sm:p-9">
          <a className="text-sm text-[var(--muted)] hover:text-[var(--accent)]" href="/explorer">
            ← Evidence explorer
          </a>
          <p className="pm-kicker mt-8">Verified settlement · Testnet</p>
          <h1 className="pm-display mt-3 text-4xl sm:text-5xl">{receipt.invoice.title}</h1>
          <p className="mt-4 text-[var(--muted)]">
            {receipt.invoice.merchant.displayName} · {receipt.settlement.asset} settled on Flare
            Coston2
          </p>
          <dl className="pm-card mt-8 space-y-5 rounded-2xl p-6 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Payment ID</dt>
              <dd className="mt-1 break-all font-mono">{receipt.paymentId}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">XRPL transaction</dt>
              <dd className="mt-1 break-all">
                <a
                  className="text-[var(--accent)] underline"
                  href={receipt.sourcePayment.explorerUrl}
                >
                  {receipt.sourcePayment.txHash}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Coston2 settlement</dt>
              <dd className="mt-1 break-all">
                <a className="text-[var(--accent)] underline" href={receipt.settlement.explorerUrl}>
                  {receipt.settlement.flareTxHash}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
