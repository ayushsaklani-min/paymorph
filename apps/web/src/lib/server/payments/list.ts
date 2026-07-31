import { AttemptStatus, db, type Prisma } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const attemptStatuses = [
  'CREATED',
  'IDENTIFYING',
  'IDENTIFIED',
  'QUOTED',
  'XAMAN_CREATED',
  'AWAITING_SIGNATURE',
  'XRPL_SIGNED',
  'XRPL_VALIDATED',
  'USEROP_UPLOADED',
  'FDC_REQUESTED',
  'FDC_READY',
  'FLARE_SUBMITTED',
  'FLARE_CONFIRMED',
  'SETTLED',
  'REJECTED',
  'QUOTE_EXPIRED',
  'XRPL_FAILED',
  'EXECUTION_REVERTED',
  'RECOVERY_REQUIRED',
  'RECOVERED',
  'CANCELLED',
] as const;

const querySchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_LIMIT))
    .optional(),
  status: z.enum(attemptStatuses).optional(),
  invoiceId: z.uuid().optional(),
});

const cursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

type PaymentCursor = { createdAt: Date; id: string };

export type PaymentListQuery = {
  cursor: PaymentCursor | null;
  limit: number;
  status?: AttemptStatus;
  invoiceId?: string;
};

export function parsePaymentListQuery(searchParams: URLSearchParams): PaymentListQuery {
  const values: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (values[key] !== undefined) {
      throw new DomainError('VALIDATION_ERROR', `Query parameter "${key}" must appear once`);
    }
    values[key] = value;
  }

  const parsed = querySchema.parse(values);
  return {
    cursor: parsed.cursor === undefined ? null : decodePaymentCursor(parsed.cursor),
    limit: parsed.limit ?? DEFAULT_LIMIT,
    ...(parsed.status === undefined ? {} : { status: AttemptStatus[parsed.status] }),
    ...(parsed.invoiceId === undefined ? {} : { invoiceId: parsed.invoiceId }),
  };
}

export function encodePaymentCursor(payment: PaymentCursor): string {
  return Buffer.from(
    JSON.stringify({ version: 1, createdAt: payment.createdAt.toISOString(), id: payment.id }),
    'utf8',
  ).toString('base64url');
}

export function decodePaymentCursor(value: string): PaymentCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Cursor is not base64url');
    const payload = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    const cursor = { createdAt: new Date(payload.createdAt), id: payload.id };
    if (encodePaymentCursor(cursor) !== value) throw new Error('Cursor is not canonical');
    return cursor;
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Payment cursor is invalid');
  }
}

export async function listMerchantPayments(merchantId: string, searchParams: URLSearchParams) {
  const query = parsePaymentListQuery(searchParams);
  const cursorFilter: Prisma.PaymentAttemptWhereInput =
    query.cursor === null
      ? {}
      : {
          OR: [
            { createdAt: { lt: query.cursor.createdAt } },
            { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
          ],
        };
  const attempts = await db.paymentAttempt.findMany({
    where: {
      invoice: { merchantId },
      ...cursorFilter,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.invoiceId === undefined ? {} : { invoiceId: query.invoiceId }),
    },
    select: {
      id: true,
      paymentId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      xrplTxHash: true,
      xrplLedgerIndex: true,
      flareTxHash: true,
      settledAt: true,
      failureCode: true,
      failureMessage: true,
      invoice: {
        select: { id: true, title: true, externalRef: true, settlementAsset: true },
      },
      quote: {
        select: {
          xrplPaymentDrops: true,
          invoiceOutBaseUnits: true,
          serviceFeeOutBaseUnits: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
  const hasNextPage = attempts.length > query.limit;
  const page = hasNextPage ? attempts.slice(0, query.limit) : attempts;
  const lastPayment = page.at(-1);
  return {
    items: page.map(serializeMerchantPayment),
    nextCursor: hasNextPage && lastPayment !== undefined ? encodePaymentCursor(lastPayment) : null,
  };
}

export function serializeMerchantPayment(payment: {
  id: string;
  paymentId: string;
  status: AttemptStatus;
  createdAt: Date;
  updatedAt: Date;
  xrplTxHash: string | null;
  xrplLedgerIndex: bigint | null;
  flareTxHash: string | null;
  settledAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  invoice: { id: string; title: string; externalRef: string | null; settlementAsset: string };
  quote: {
    xrplPaymentDrops: { toFixed(fractionDigits?: number): string };
    invoiceOutBaseUnits: { toFixed(fractionDigits?: number): string };
    serviceFeeOutBaseUnits: { toFixed(fractionDigits?: number): string };
  };
}) {
  return {
    id: payment.id,
    paymentId: payment.paymentId,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    invoice: payment.invoice,
    sourcePayment: {
      xrpDrops: payment.quote.xrplPaymentDrops.toFixed(0),
      txHash: payment.xrplTxHash,
      ledgerIndex: payment.xrplLedgerIndex?.toString() ?? null,
    },
    settlement: {
      asset: payment.invoice.settlementAsset,
      invoiceBaseUnits: payment.quote.invoiceOutBaseUnits.toFixed(0),
      serviceFeeBaseUnits: payment.quote.serviceFeeOutBaseUnits.toFixed(0),
      txHash: payment.flareTxHash,
      settledAt: payment.settledAt?.toISOString() ?? null,
    },
    failure:
      payment.failureCode === null && payment.failureMessage === null
        ? null
        : { code: payment.failureCode, message: payment.failureMessage },
  };
}
