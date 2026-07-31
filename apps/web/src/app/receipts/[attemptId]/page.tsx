import { notFound } from 'next/navigation';
import { buildPublicReceipt } from '@/lib/server/receipts/service';

export default async function ReceiptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const receipt = await buildPublicReceipt((await params).attemptId);
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <a className="text-sm text-[var(--muted)]" href="/explorer">
          ← Evidence explorer
        </a>
        <p className="mt-8 text-sm text-[var(--accent)]">Verified settlement receipt · Testnet</p>
        <h1 className="mt-2 text-4xl font-semibold">{receipt.invoice.title}</h1>
        <p className="mt-4 text-[var(--muted)]">
          {receipt.invoice.merchant.displayName} · {receipt.settlement.asset} settled on Flare
          Coston2
        </p>
        <dl className="mt-8 space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-sm">
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
      </main>
    );
  } catch {
    notFound();
  }
}
