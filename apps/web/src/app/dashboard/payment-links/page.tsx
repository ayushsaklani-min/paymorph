import { db } from '@paymorph/db';
import { requireMerchant } from '@/lib/server/auth/session';
import { PaymentLinkActions } from '@/features/payment-links/payment-link-actions';
import { PaymentLinkForm } from '@/features/payment-links/payment-link-form';

export default async function PaymentLinksPage() {
  const merchant = await requireMerchant();
  const links = await db.paymentLink.findMany({
    where: { merchantId: merchant.id },
    include: { _count: { select: { invoices: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="py-12">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <p className="text-sm text-[var(--muted)]">Collection surface</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Payment links</h1>
          <p className="mt-3 max-w-xl text-[var(--muted)]">
            Share a hosted checkout without creating a parallel payment path. Every checkout becomes
            a canonical PayMorph invoice.
          </p>
          <div className="mt-8 space-y-3">
            {links.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-[var(--muted)]">
                No payment links yet. Create one for a shareable hosted checkout.
              </div>
            ) : (
              links.map((link) => (
                <article
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
                  key={link.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                        <span>{link.mode === 'SINGLE_USE' ? 'Single use' : 'Reusable'}</span>
                        <span>·</span>
                        <span>{link.status}</span>
                        <span>·</span>
                        <span>
                          {link._count.invoices} checkout invoice
                          {link._count.invoices === 1 ? '' : 's'}
                        </span>
                      </div>
                      <h2 className="mt-2 font-semibold">{link.name}</h2>
                      <a
                        className="mt-2 block break-all text-sm text-[var(--accent)] underline"
                        href={`/l/${link.slug}`}
                      >
                        /l/{link.slug}
                      </a>
                    </div>
                    {link.status === 'ACTIVE' ? <PaymentLinkActions id={link.id} /> : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">New payment link</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            FXRP remains the available settlement route on Coston2.
          </p>
          <PaymentLinkForm merchantAddress={merchant.walletAddress} />
        </aside>
      </div>
    </main>
  );
}
