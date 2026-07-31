import { randomBytes } from 'node:crypto';
import {
  db,
  Denomination,
  InvoiceStatus,
  PaymentRequestStatus,
  SettlementAsset,
  type Invoice,
  type PaymentRequest,
} from '@paymorph/db';
import { createInvoiceSchema, DomainError, parseDisplayAmount } from '@paymorph/shared';
import { z } from 'zod';

export const createPaymentRequestSchema = z.strictObject({
  reference: z.string().trim().min(1).max(80),
  recipientName: z.string().trim().min(1).max(120).optional(),
  recipientEmail: z.email().max(254).optional(),
  invoice: createInvoiceSchema,
});

export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;

export type PaymentRequestWithInvoice = PaymentRequest & { invoice: Invoice };

export async function listPaymentRequests(
  merchantId: string,
): Promise<PaymentRequestWithInvoice[]> {
  return db.paymentRequest.findMany({
    where: { merchantId },
    include: { invoice: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createPaymentRequest(
  merchantId: string,
  input: CreatePaymentRequestInput,
): Promise<PaymentRequest> {
  return db.$transaction(async (transaction) => {
    const invoiceInput = input.invoice;
    const invoice = await transaction.invoice.create({
      data: {
        merchantId,
        publicSlug: randomBytes(12).toString('base64url'),
        title: invoiceInput.title,
        description: invoiceInput.description ?? null,
        externalRef: invoiceInput.externalRef ?? null,
        denomination: Denomination[invoiceInput.denomination],
        amountBaseUnits: parseDisplayAmount(
          invoiceInput.amount,
          invoiceInput.denomination === 'XRP' ? 6 : 2,
        ).toString(),
        settlementAsset: SettlementAsset[invoiceInput.settlementAsset],
        status: InvoiceStatus.ACTIVE,
        expiresAt: new Date(invoiceInput.expiresAt),
        publishedAt: new Date(),
        recipients: {
          create: invoiceInput.recipients.map((recipient, position) => ({
            position,
            label: recipient.label,
            address: recipient.address,
            bps: recipient.bps,
          })),
        },
      },
    });
    return transaction.paymentRequest.create({
      data: {
        merchantId,
        invoiceId: invoice.id,
        reference: input.reference,
        recipientName: input.recipientName ?? null,
        recipientEmail: input.recipientEmail ?? null,
      },
    });
  });
}

export async function cancelPaymentRequest(
  merchantId: string,
  id: string,
): Promise<PaymentRequest> {
  return db.$transaction(async (transaction) => {
    const request = await transaction.paymentRequest.findFirst({ where: { id, merchantId } });
    if (!request || request.status !== PaymentRequestStatus.ACTIVE) {
      throw new DomainError('VALIDATION_ERROR', 'Payment request cannot be cancelled');
    }
    await transaction.invoice.update({
      where: { id: request.invoiceId },
      data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date() },
    });
    return transaction.paymentRequest.update({
      where: { id },
      data: { status: PaymentRequestStatus.CANCELLED, cancelledAt: new Date() },
    });
  });
}
