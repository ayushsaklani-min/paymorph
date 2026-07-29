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
  const { attemptId } = await params;
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6">
      <a className="text-lg font-semibold" href="/">
        PayMorph
      </a>
      <div className="mt-8">
        <AttemptStatus attemptId={attemptId} />
      </div>
    </main>
  );
}
