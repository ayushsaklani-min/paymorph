import { requireMerchant } from '@/lib/server/auth/session';
import { InvoiceForm } from '@/features/invoices/invoice-form';

export default async function NewInvoicePage() {
  const merchant = await requireMerchant();
  return (
    <main className="py-12">
      <a className="text-sm text-[var(--muted)]" href="/dashboard/invoices">
        ← Invoices
      </a>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Create invoice</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Financial terms become immutable after publishing. Quotes are created only when an
        identified payer checks out.
      </p>
      <InvoiceForm merchantAddress={merchant.walletAddress} />
    </main>
  );
}
