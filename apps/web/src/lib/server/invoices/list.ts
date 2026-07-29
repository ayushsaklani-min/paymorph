import { db, InvoiceStatus, SettlementAsset, type Invoice, type Prisma } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';
import { serializeInvoice } from './service';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const querySchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_LIMIT))
    .optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  settlementAsset: z.enum(['FXRP', 'USDT0']).optional(),
});

const cursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

type InvoiceCursor = {
  createdAt: Date;
  id: string;
};

export type InvoiceListQuery = {
  cursor: InvoiceCursor | null;
  limit: number;
  status?: InvoiceStatus;
  settlementAsset?: SettlementAsset;
};

export function parseInvoiceListQuery(searchParams: URLSearchParams): InvoiceListQuery {
  const values: Record<string, string> = {};

  for (const [key, value] of searchParams.entries()) {
    if (values[key] !== undefined) {
      throw new DomainError('VALIDATION_ERROR', `Query parameter "${key}" must appear once`);
    }
    values[key] = value;
  }

  const parsed = querySchema.parse(values);
  return {
    cursor: parsed.cursor === undefined ? null : decodeInvoiceCursor(parsed.cursor),
    limit: parsed.limit ?? DEFAULT_LIMIT,
    ...(parsed.status === undefined ? {} : { status: InvoiceStatus[parsed.status] }),
    ...(parsed.settlementAsset === undefined
      ? {}
      : { settlementAsset: SettlementAsset[parsed.settlementAsset] }),
  };
}

export function encodeInvoiceCursor(invoice: Pick<Invoice, 'createdAt' | 'id'>): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      createdAt: invoice.createdAt.toISOString(),
      id: invoice.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeInvoiceCursor(value: string): InvoiceCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Cursor is not base64url');

    const payload = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    const cursor = {
      createdAt: new Date(payload.createdAt),
      id: payload.id,
    };

    if (encodeInvoiceCursor(cursor) !== value) throw new Error('Cursor is not canonical');
    return cursor;
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Invoice cursor is invalid');
  }
}

export async function listInvoices(merchantId: string, searchParams: URLSearchParams) {
  const query = parseInvoiceListQuery(searchParams);
  const cursorFilter: Prisma.InvoiceWhereInput =
    query.cursor === null
      ? {}
      : {
          OR: [
            { createdAt: { lt: query.cursor.createdAt } },
            { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
          ],
        };

  const invoices = await db.invoice.findMany({
    where: {
      merchantId,
      ...cursorFilter,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.settlementAsset === undefined ? {} : { settlementAsset: query.settlementAsset }),
    },
    include: { recipients: { orderBy: { position: 'asc' } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });

  const hasNextPage = invoices.length > query.limit;
  const page = hasNextPage ? invoices.slice(0, query.limit) : invoices;
  const lastInvoice = page.at(-1);

  return {
    items: page.map(serializeInvoice),
    nextCursor: hasNextPage && lastInvoice !== undefined ? encodeInvoiceCursor(lastInvoice) : null,
  };
}
