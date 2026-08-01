import { requireMerchant } from '@/lib/server/auth/session';
import { db } from '@paymorph/db';
import { InvoiceForm, type InvoiceFormTemplate } from '@/features/invoices/invoice-form';
import { invoiceTemplateDefaultsSchema } from '@/lib/server/invoices/templates';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>;
}) {
  const merchant = await requireMerchant();
  const templateId = (await searchParams).template;
  const template =
    typeof templateId === 'string'
      ? await db.invoiceTemplate.findFirst({ where: { id: templateId, merchantId: merchant.id } })
      : null;
  const parsedDefaults = template
    ? invoiceTemplateDefaultsSchema.safeParse(template.defaultsJson)
    : null;
  const formTemplate: InvoiceFormTemplate | undefined =
    template && parsedDefaults?.success
      ? { id: template.id, name: template.name, defaults: parsedDefaults.data }
      : undefined;

  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <a className="text-sm text-[var(--muted)]" href="/dashboard/invoices">
        ← Invoices
      </a>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Create invoice</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Financial terms become immutable after publishing. Quotes are created only when an
        identified payer checks out.
      </p>
      <InvoiceForm merchantAddress={merchant.walletAddress} template={formTemplate} />
    </main>
  );
}
