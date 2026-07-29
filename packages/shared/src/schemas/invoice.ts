import { getAddress, isAddress } from 'viem';
import { z } from 'zod';
import { MAX_RECIPIENTS, TOTAL_BPS } from '../constants/network.js';

const canonicalAmount = z.string().regex(/^(0|[1-9]\d*)(?:\.\d+)?$/, 'Invalid decimal amount');

const recipientSchema = z.object({
  label: z.string().trim().min(1).max(50),
  address: z
    .string()
    .refine(isAddress, 'Invalid Coston2 address')
    .transform((value) => getAddress(value)),
  bps: z.int().min(1).max(TOTAL_BPS),
});

export const createInvoiceSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    externalRef: z.string().trim().max(80).optional(),
    denomination: z.enum(['XRP', 'USD']),
    amount: canonicalAmount.refine((value) => /[1-9]/.test(value), 'Amount must be positive'),
    settlementAsset: z.enum(['FXRP', 'USDT0']),
    expiresAt: z.iso.datetime(),
    recipients: z.array(recipientSchema).min(1).max(MAX_RECIPIENTS),
  })
  .superRefine((value, context) => {
    const total = value.recipients.reduce((sum, recipient) => sum + recipient.bps, 0);
    if (total !== TOTAL_BPS) {
      context.addIssue({
        code: 'custom',
        path: ['recipients'],
        message: 'Recipient basis points must total exactly 10,000',
      });
    }
    const normalized = value.recipients.map((recipient) => recipient.address.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: 'custom',
        path: ['recipients'],
        message: 'Recipient addresses must be unique',
      });
    }
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
