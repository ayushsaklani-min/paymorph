import { randomBytes } from 'node:crypto';
import {
  db,
  Denomination,
  InvoiceStatus,
  SettlementAsset,
  type Invoice,
  type InvoiceRecipient,
} from '@paymorph/db';
import {
  createInvoiceSchema,
  DomainError,
  formatBaseUnits,
  parseDisplayAmount,
  type CreateInvoiceInput,
} from '@paymorph/shared';
import { z } from 'zod';

const MIN_EXPIRY_MS = 15 * 60 * 1_000;
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1_000;

export type InvoiceWithRecipients = Invoice & { recipients: InvoiceRecipient[] };

const updateInvoiceSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    externalRef: z.string().trim().max(80).nullable().optional(),
    denomination: z.enum(['XRP', 'USD']).optional(),
    amount: z
      .string()
      .regex(/^(0|[1-9]\d*)(?:\.\d+)?$/)
      .refine((value) => /[1-9]/.test(value), 'Amount must be positive')
      .optional(),
    settlementAsset: z.enum(['FXRP', 'USDT0']).optional(),
    expiresAt: z.iso.datetime().optional(),
    recipients: createInvoiceSchema.shape.recipients.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one invoice field is required')
  .refine(
    (value) => value.denomination === undefined || value.amount !== undefined,
    'Changing denomination requires an explicit amount',
  );

export async function createInvoice(
  merchantId: string,
  rawInput: unknown,
): Promise<InvoiceWithRecipients> {
  const input = createInvoiceSchema.parse(rawInput);
  validateExpiry(input);
  const decimals = input.denomination === 'XRP' ? 6 : 2;
  const amountBaseUnits = parseDisplayAmount(input.amount, decimals);

  return db.invoice.create({
    data: {
      merchantId,
      publicSlug: randomBytes(12).toString('base64url'),
      title: input.title,
      description: input.description ?? null,
      externalRef: input.externalRef ?? null,
      denomination: Denomination[input.denomination],
      amountBaseUnits: amountBaseUnits.toString(),
      settlementAsset: SettlementAsset[input.settlementAsset],
      expiresAt: new Date(input.expiresAt),
      recipients: {
        create: input.recipients.map((recipient, position) => ({
          position,
          label: recipient.label,
          address: recipient.address,
          bps: recipient.bps,
        })),
      },
    },
    include: { recipients: { orderBy: { position: 'asc' } } },
  });
}

export async function publishInvoice(
  merchantId: string,
  invoiceId: string,
): Promise<InvoiceWithRecipients> {
  return db.$transaction(async (transaction) => {
    const invoice = await transaction.invoice.findFirst({
      where: { id: invoiceId, merchantId },
      include: { recipients: { orderBy: { position: 'asc' } } },
    });
    if (!invoice) throw new DomainError('FORBIDDEN', 'Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new DomainError('VALIDATION_ERROR', 'Only draft invoices can be published');
    }
    if (invoice.expiresAt <= new Date(Date.now() + MIN_EXPIRY_MS)) {
      throw new DomainError('VALIDATION_ERROR', 'Invoice expiry is too close to publish');
    }
    return transaction.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.ACTIVE, publishedAt: new Date() },
      include: { recipients: { orderBy: { position: 'asc' } } },
    });
  });
}

export async function cancelInvoice(
  merchantId: string,
  invoiceId: string,
): Promise<InvoiceWithRecipients> {
  return db.$transaction(async (transaction) => {
    const invoice = await transaction.invoice.findFirst({
      where: { id: invoiceId, merchantId },
    });
    if (!invoice) throw new DomainError('FORBIDDEN', 'Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.ACTIVE) {
      throw new DomainError('VALIDATION_ERROR', 'Invoice cannot be cancelled in its current state');
    }
    return transaction.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date() },
      include: { recipients: { orderBy: { position: 'asc' } } },
    });
  });
}

export async function updateDraftInvoice(
  merchantId: string,
  invoiceId: string,
  rawInput: unknown,
): Promise<InvoiceWithRecipients> {
  const patch = updateInvoiceSchema.parse(rawInput);
  return db.$transaction(async (transaction) => {
    const current = await transaction.invoice.findFirst({
      where: { id: invoiceId, merchantId },
      include: { recipients: { orderBy: { position: 'asc' } } },
    });
    if (!current) throw new DomainError('FORBIDDEN', 'Invoice not found');
    if (current.status !== InvoiceStatus.DRAFT) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Published or cancelled invoice terms are immutable; create a replacement invoice',
      );
    }

    const denomination = patch.denomination ?? current.denomination;
    const amount =
      patch.amount ??
      formatBaseUnits(
        BigInt(current.amountBaseUnits.toFixed(0)),
        current.denomination === Denomination.XRP ? 6 : 2,
      );
    const recipients =
      patch.recipients ??
      current.recipients.map((recipient) => ({
        label: recipient.label,
        address: recipient.address,
        bps: recipient.bps,
      }));
    const combined = createInvoiceSchema.parse({
      title: patch.title ?? current.title,
      ...(patch.description === null
        ? {}
        : { description: patch.description ?? current.description ?? undefined }),
      ...(patch.externalRef === null
        ? {}
        : { externalRef: patch.externalRef ?? current.externalRef ?? undefined }),
      denomination,
      amount,
      settlementAsset: patch.settlementAsset ?? current.settlementAsset,
      expiresAt: patch.expiresAt ?? current.expiresAt.toISOString(),
      recipients,
    });
    validateExpiry(combined);
    const amountBaseUnits = parseDisplayAmount(
      combined.amount,
      combined.denomination === 'XRP' ? 6 : 2,
    );

    return transaction.invoice.update({
      where: { id: current.id },
      data: {
        title: combined.title,
        description: patch.description === null ? null : (combined.description ?? null),
        externalRef: patch.externalRef === null ? null : (combined.externalRef ?? null),
        denomination: Denomination[combined.denomination],
        amountBaseUnits: amountBaseUnits.toString(),
        settlementAsset: SettlementAsset[combined.settlementAsset],
        expiresAt: new Date(combined.expiresAt),
        recipients: {
          deleteMany: {},
          create: combined.recipients.map((recipient, position) => ({
            position,
            label: recipient.label,
            address: recipient.address,
            bps: recipient.bps,
          })),
        },
      },
      include: { recipients: { orderBy: { position: 'asc' } } },
    });
  });
}

export function serializeInvoice(invoice: InvoiceWithRecipients) {
  return {
    ...invoice,
    amountBaseUnits: invoice.amountBaseUnits.toFixed(0),
    recipients: invoice.recipients,
  };
}

function validateExpiry(input: CreateInvoiceInput): void {
  const expiresAt = new Date(input.expiresAt).getTime();
  const lifetime = expiresAt - Date.now();
  if (lifetime < MIN_EXPIRY_MS || lifetime > MAX_EXPIRY_MS) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'Invoice expiry must be between 15 minutes and 30 days',
    );
  }
}
