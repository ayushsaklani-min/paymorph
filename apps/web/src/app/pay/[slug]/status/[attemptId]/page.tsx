import type { Metadata } from 'next';
import { AttemptStatus } from '@/features/checkout/attempt-status';

export const metadata: Metadata = {
  title: 'Payment status',
  robots: { index: false, follow: false },
};

export default async function PaymentStatusPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { attemptId, slug } = await params;
  return (
    <main className="pm-shell mx-auto min-h-screen w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="pm-panel pm-editorial-nav flex items-center justify-between gap-4 rounded-3xl px-4 py-3 sm:px-5">
        <a className="flex items-center gap-2.5" href="/">
          <span className="pm-logo-compact grid size-7 place-items-center rounded-lg border text-xs font-black">
            P
          </span>
          <span className="text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
        </a>
        <span className="pm-data rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          Testnet payment
        </span>
      </header>
      <div className="mt-8">
        <AttemptStatus attemptId={attemptId} invoiceSlug={slug} />
      </div>
    </main>
  );
}
