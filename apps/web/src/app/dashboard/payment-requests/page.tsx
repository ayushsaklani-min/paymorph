import { requireMerchant } from '@/lib/server/auth/session';
import { listPaymentRequests } from '@/lib/server/payment-requests/service';
import { PaymentRequestActions } from '@/features/payment-requests/payment-request-actions';
import { PaymentRequestForm } from '@/features/payment-requests/payment-request-form';

export default async function PaymentRequestsPage() {
  const merchant = await requireMerchant();
  const requests = await listPaymentRequests(merchant.id);
  return (
    <main className="py-12">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <p className="text-sm text-[var(--muted)]">Collection surface</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Payment requests</h1>
          <p className="mt-3 max-w-xl text-[var(--muted)]">
            Create a named, expiring checkout request. The public link is an immutable PayMorph
            invoice and settlement remains evidence-driven.
          </p>
          <div className="mt-8 space-y-3">
            {requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-[var(--muted)]">
                No payment requests yet.
              </div>
            ) : (
              requests.map((request) => (
                <article
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
                  key={request.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-[var(--muted)]">
                        {request.status}
                        {request.recipientName ? ` · ${request.recipientName}` : ''}
                      </p>
                      <h2 className="mt-2 font-semibold">{request.reference}</h2>
                      <a
                        className="mt-2 block break-all text-sm text-[var(--accent)] underline"
                        href={`/pay/${request.invoice.publicSlug}`}
                      >
                        /pay/{request.invoice.publicSlug}
                      </a>
                    </div>
                    {request.status === 'ACTIVE' ? <PaymentRequestActions id={request.id} /> : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">New payment request</h2>
          <PaymentRequestForm merchantAddress={merchant.walletAddress} />
        </aside>
      </div>
    </main>
  );
}
