import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { XamanBoundaryError } from './types.js';

const webhookSchema = z.object({
  meta: z.object({
    application_uuidv4: z.string().uuid(),
    payload_uuidv4: z.string().uuid(),
  }),
  payloadResponse: z.object({
    payload_uuidv4: z.string().uuid(),
    reference_call_uuidv4: z.string().uuid(),
    signed: z.boolean(),
    txid: z.string().nullable().optional(),
  }),
});

export interface VerifyXamanWebhookInput {
  body: unknown;
  timestampHeader: string | null;
  signatureHeader: string | null;
  applicationSecret: string;
  expectedApplicationId: string;
  nowMs?: number;
  maximumAgeMs?: number;
  maximumFutureSkewMs?: number;
}

export interface VerifiedXamanWebhook {
  applicationId: string;
  payloadUuid: string;
  referenceCallUuid: string;
  signed: boolean;
  transactionHash: string | null;
}

function parseProviderTimestamp(value: string): number {
  if (/^[0-9]{10}$/.test(value)) {
    return Number(value) * 1_000;
  }
  if (/^[0-9]{13}$/.test(value)) {
    return Number(value);
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new XamanBoundaryError('WEBHOOK_REJECTED', 'Invalid Xaman webhook timestamp');
  }
  return parsed;
}

export function computeXamanWebhookSignature(
  applicationSecret: string,
  timestamp: string,
  body: unknown,
): string {
  if (applicationSecret.length === 0) {
    throw new XamanBoundaryError(
      'INVALID_CONFIGURATION',
      'Xaman application secret must not be empty',
    );
  }

  // Xaman's documented algorithm removes only the first hyphen.
  const key = applicationSecret.replace('-', '');
  return createHmac('sha1', key)
    .update(timestamp + JSON.stringify(body))
    .digest('hex');
}

export function verifyXamanWebhook(input: VerifyXamanWebhookInput): VerifiedXamanWebhook {
  if (input.timestampHeader === null || input.signatureHeader === null) {
    throw new XamanBoundaryError('WEBHOOK_REJECTED', 'Missing Xaman webhook signature headers');
  }

  const parsed = webhookSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new XamanBoundaryError(
      'WEBHOOK_REJECTED',
      `Invalid Xaman webhook body: ${z.prettifyError(parsed.error)}`,
    );
  }

  const expectedSignature = computeXamanWebhookSignature(
    input.applicationSecret,
    input.timestampHeader,
    input.body,
  );
  const receivedSignature = input.signatureHeader.toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(receivedSignature)) {
    throw new XamanBoundaryError('WEBHOOK_REJECTED', 'Invalid Xaman webhook signature encoding');
  }

  const expectedBytes = Buffer.from(expectedSignature, 'hex');
  const receivedBytes = Buffer.from(receivedSignature, 'hex');
  if (
    expectedBytes.length !== receivedBytes.length ||
    !timingSafeEqual(expectedBytes, receivedBytes)
  ) {
    throw new XamanBoundaryError('WEBHOOK_REJECTED', 'Invalid Xaman webhook signature');
  }

  const nowMs = input.nowMs ?? Date.now();
  const maximumAgeMs = input.maximumAgeMs ?? 5 * 60 * 1_000;
  const maximumFutureSkewMs = input.maximumFutureSkewMs ?? 30 * 1_000;
  const providerTimeMs = parseProviderTimestamp(input.timestampHeader);

  if (providerTimeMs < nowMs - maximumAgeMs) {
    throw new XamanBoundaryError('WEBHOOK_REJECTED', 'Stale Xaman webhook');
  }
  if (providerTimeMs > nowMs + maximumFutureSkewMs) {
    throw new XamanBoundaryError('WEBHOOK_REJECTED', 'Xaman webhook timestamp is in the future');
  }

  const data = parsed.data;
  if (
    data.meta.application_uuidv4 !== input.expectedApplicationId ||
    data.meta.payload_uuidv4 !== data.payloadResponse.payload_uuidv4
  ) {
    throw new XamanBoundaryError('WEBHOOK_REJECTED', 'Xaman webhook identity mismatch');
  }

  return {
    applicationId: data.meta.application_uuidv4,
    payloadUuid: data.payloadResponse.payload_uuidv4,
    referenceCallUuid: data.payloadResponse.reference_call_uuidv4,
    signed: data.payloadResponse.signed,
    transactionHash: data.payloadResponse.txid ?? null,
  };
}
