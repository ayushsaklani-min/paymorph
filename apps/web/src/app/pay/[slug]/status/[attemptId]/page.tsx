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
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <a className="text-lg font-semibold tracking-tight" href="/">
          PayMorph
        </a>
        <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
          Testnet payment
        </span>
      </header>
      <div className="mt-8">
        <AttemptStatus attemptId={attemptId} invoiceSlug={slug} />
      </div>
    </main>
  );
}
