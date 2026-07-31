import { db, type InvoiceTemplate } from '@paymorph/db';
import { getAddress, isAddress } from 'viem';
import { z } from 'zod';

export const invoiceTemplateRecipientSchema = z.strictObject({
  label: z.string().trim().min(1).max(50),
  address: z
    .string()
    .refine(isAddress, 'Invalid Coston2 address')
    .transform((value) => getAddress(value)),
  bps: z.number().int().min(1).max(10_000),
});

export const invoiceTemplateDefaultsSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    denomination: z.enum(['USD', 'XRP']).default('USD'),
    amount: z
      .string()
      .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/, 'Invalid decimal amount')
      .refine((value) => /[1-9]/.test(value), 'Amount must be positive')
      .optional(),
    settlementAsset: z.enum(['FXRP', 'USDT0']).default('FXRP'),
    expiresInHours: z.number().int().min(1).max(720).default(24),
    recipients: z.array(invoiceTemplateRecipientSchema).min(1).max(10),
  })
  .refine(
    (value) => value.recipients.reduce((total, recipient) => total + recipient.bps, 0) === 10_000,
    'Recipient splits must total 10,000 bps',
  )
  .refine(
    (value) =>
      new Set(value.recipients.map((recipient) => recipient.address.toLowerCase())).size ===
      value.recipients.length,
    'Recipient addresses must be unique',
  );

export const invoiceTemplateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  defaults: invoiceTemplateDefaultsSchema,
});

export type InvoiceTemplateInput = z.infer<typeof invoiceTemplateSchema>;

export async function listInvoiceTemplates(merchantId: string): Promise<InvoiceTemplate[]> {
  return db.invoiceTemplate.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' } });
}

export async function createInvoiceTemplate(
  merchantId: string,
  input: InvoiceTemplateInput,
): Promise<InvoiceTemplate> {
  return db.invoiceTemplate.create({
    data: { merchantId, name: input.name, defaultsJson: input.defaults },
  });
}
