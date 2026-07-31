import { requireMerchant } from '@/lib/server/auth/session';
import { listInvoiceTemplates } from '@/lib/server/invoices/templates';
import { InvoiceTemplateForm } from '@/features/invoices/invoice-template-form';

export default async function InvoiceTemplatesPage() {
  const merchant = await requireMerchant();
  const templates = await listInvoiceTemplates(merchant.id);

  return (
    <main className="py-12">
      <a className="text-sm text-[var(--muted)]" href="/dashboard/invoices">
        ← Invoices
      </a>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <p className="text-sm text-[var(--muted)]">Reusable collection setup</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Invoice templates</h1>
          <p className="mt-3 max-w-xl text-[var(--muted)]">
            Save recurring invoice details and recipient splits. Each invoice remains a new,
            immutable payment request when you publish it.
          </p>
          <div className="mt-8 space-y-3">
            {templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-[var(--muted)]">
                No saved templates. Create one to make your next payment link faster.
              </div>
            ) : (
              templates.map((template) => (
                <article
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
                  key={template.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold">{template.name}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Template saved {template.updatedAt.toISOString().slice(0, 10)} UTC.
                      </p>
                    </div>
                    <a
                      className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-medium hover:border-[var(--accent)]"
                      href={`/dashboard/invoices/new?template=${template.id}`}
                    >
                      Use template
                    </a>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
        <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">New template</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Templates store only invoice defaults. They never create a charge or settlement on their
            own.
          </p>
          <InvoiceTemplateForm merchantAddress={merchant.walletAddress} />
        </aside>
      </div>
    </main>
  );
}
