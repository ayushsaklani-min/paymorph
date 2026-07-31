import { randomBytes } from 'node:crypto';
import {
  db,
  Denomination,
  InvoiceStatus,
  PaymentLinkMode,
  PaymentLinkStatus,
  Prisma,
  SettlementAsset,
  type PaymentLink,
} from '@paymorph/db';
import { DomainError, parseDisplayAmount } from '@paymorph/shared';
import { z } from 'zod';
import { invoiceTemplateRecipientSchema } from '../invoices/templates.js';

const MIN_EXPIRY_MS = 15 * 60 * 1_000;
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1_000;

export const paymentLinkDefaultsSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    denomination: z.enum(['USD', 'XRP']),
    amount: z
      .string()
      .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/, 'Invalid decimal amount')
      .refine((value) => /[1-9]/.test(value), 'Amount must be positive'),
    settlementAsset: z.enum(['FXRP', 'USDT0']),
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

export const createPaymentLinkSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    mode: z.enum(['SINGLE_USE', 'REUSABLE']),
    defaults: paymentLinkDefaultsSchema,
    expiresAt: z.iso.datetime().optional(),
  })
  .superRefine((value, context) => {
    if (value.expiresAt) {
      const timestamp = new Date(value.expiresAt).getTime();
      const now = Date.now();
      if (timestamp <= now + MIN_EXPIRY_MS || timestamp > now + MAX_EXPIRY_MS) {
        context.addIssue({
          code: 'custom',
          path: ['expiresAt'],
          message: 'Link expiry must be between 15 minutes and 30 days from now',
        });
      }
    }
  });

export type PaymentLinkDefaults = z.infer<typeof paymentLinkDefaultsSchema>;
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

export async function listPaymentLinks(merchantId: string): Promise<PaymentLink[]> {
  return db.paymentLink.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' } });
}

export async function createPaymentLink(
  merchantId: string,
  input: CreatePaymentLinkInput,
): Promise<PaymentLink> {
  return db.paymentLink.create({
    data: {
      merchantId,
      slug: randomBytes(12).toString('base64url'),
      name: input.name,
      mode: PaymentLinkMode[input.mode],
      defaultsJson: input.defaults,
      ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
    },
  });
}

export async function archivePaymentLink(merchantId: string, id: string): Promise<PaymentLink> {
  const result = await db.paymentLink.updateMany({
    where: { id, merchantId, status: PaymentLinkStatus.ACTIVE },
    data: { status: PaymentLinkStatus.ARCHIVED, archivedAt: new Date() },
  });
  if (result.count !== 1)
    throw new DomainError('VALIDATION_ERROR', 'Payment link cannot be archived');
  return db.paymentLink.findUniqueOrThrow({ where: { id } });
}

/**
 * A bearer-key integration may start checkout only for one of its own links.
 * The actual materialization remains in the same serializable public-link
 * service, so single-use replay protection is identical for every surface.
 */
export async function startMerchantPaymentLinkCheckout(
  merchantId: string,
  id: string,
): Promise<{ invoiceSlug: string }> {
  const link = await db.paymentLink.findFirst({
    where: { id, merchantId },
    select: { slug: true },
  });
  if (!link) throw new DomainError('FORBIDDEN', 'Payment link not found');
  return startPaymentLinkCheckout(link.slug);
}

export async function startPaymentLinkCheckout(slug: string): Promise<{ invoiceSlug: string }> {
  return db.$transaction(
    async (transaction) => {
      const initial = await transaction.paymentLink.findUnique({ where: { slug } });
      if (!initial) throw new DomainError('VALIDATION_ERROR', 'Payment link is unavailable');

      // Updating the row first acquires a database lock. It serializes single-use checkout creation.
      await transaction.paymentLink.update({
        where: { id: initial.id },
        data: { updatedAt: new Date() },
      });
      const link = await transaction.paymentLink.findUniqueOrThrow({ where: { id: initial.id } });
      const now = new Date();
      if (
        link.status !== PaymentLinkStatus.ACTIVE ||
        (link.expiresAt !== null && link.expiresAt <= now)
      ) {
        throw new DomainError('VALIDATION_ERROR', 'Payment link is unavailable');
      }

      if (link.mode === PaymentLinkMode.SINGLE_USE && link.singleUseInvoiceId) {
        const invoice = await transaction.invoice.findUnique({
          where: { id: link.singleUseInvoiceId },
        });
        if (!invoice)
          throw new DomainError('INTERNAL_ERROR', 'Payment link checkout is inconsistent');
        return { invoiceSlug: invoice.publicSlug };
      }

      const defaults = paymentLinkDefaultsSchema.safeParse(link.defaultsJson);
      if (!defaults.success)
        throw new DomainError('INTERNAL_ERROR', 'Payment link defaults are invalid');
      const expiresAt = new Date(now.getTime() + defaults.data.expiresInHours * 60 * 60 * 1_000);
      const invoiceExpiresAt =
        link.expiresAt && link.expiresAt < expiresAt ? link.expiresAt : expiresAt;
      const amountBaseUnits = parseDisplayAmount(
        defaults.data.amount,
        defaults.data.denomination === 'XRP' ? 6 : 2,
      );
      const invoice = await transaction.invoice.create({
        data: {
          merchantId: link.merchantId,
          paymentLinkId: link.id,
          publicSlug: randomBytes(12).toString('base64url'),
          title: defaults.data.title,
          description: defaults.data.description ?? null,
          denomination: Denomination[defaults.data.denomination],
          amountBaseUnits: amountBaseUnits.toString(),
          settlementAsset: SettlementAsset[defaults.data.settlementAsset],
          status: InvoiceStatus.ACTIVE,
          expiresAt: invoiceExpiresAt,
          publishedAt: now,
          recipients: {
            create: defaults.data.recipients.map((recipient, position) => ({
              position,
              label: recipient.label,
              address: recipient.address,
              bps: recipient.bps,
            })),
          },
        },
      });
      if (link.mode === PaymentLinkMode.SINGLE_USE) {
        await transaction.paymentLink.update({
          where: { id: link.id },
          data: { singleUseInvoiceId: invoice.id },
        });
      }
      return { invoiceSlug: invoice.publicSlug };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
