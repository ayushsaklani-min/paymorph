import { notFound } from 'next/navigation';
import { db, PaymentLinkStatus } from '@paymorph/db';
import { TestnetNotice } from '@paymorph/ui';
import { PaymentLinkCheckout } from '@/features/payment-links/payment-link-checkout';
import { PaymentLinkAnalytics } from '@/features/payment-links/payment-link-analytics';

export default async function PaymentLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await db.paymentLink.findUnique({ where: { slug } });
  if (
    !link ||
    link.status !== PaymentLinkStatus.ACTIVE ||
    (link.expiresAt !== null && link.expiresAt <= new Date())
  ) {
    notFound();
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10">
      <section className="w-full rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-2xl shadow-black/20">
        <p className="text-sm text-[var(--muted)]">PayMorph payment link</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{link.name}</h1>
        <p className="mt-3 text-[var(--muted)]">
          You will review the exact invoice before connecting Xaman or signing any XRP Testnet
          payment.
        </p>
        <PaymentLinkCheckout slug={link.slug} />
        <PaymentLinkAnalytics slug={link.slug} />
        <TestnetNotice className="mt-6 rounded-xl bg-white/[0.04] px-4 py-3 text-sm text-[var(--muted)]" />
      </section>
    </main>
  );
}
