import { z } from 'zod';
import { createHash } from 'node:crypto';
import {
  XAMAN_TESTNET,
  XamanBoundaryError,
  type XamanAuthoritativePayload,
  type XamanCreatedPayload,
  type XamanPaymentPayloadInput,
  type XamanPayloadKind,
  type XamanPayloadRequest,
  type XamanRecoveryPayloadInput,
  type XamanResolvedExpectation,
  type XamanSignInPayloadInput,
} from './types.js';

const CLASSIC_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const HEX_64 = /^[A-Fa-f0-9]{64}$/;
const HEX_BLOB = /^(?:[A-Fa-f0-9]{2})+$/;
const HASH_INSTRUCTION_MEMO = /^[A-Fa-f0-9]{84}$/;
const MAX_XRP_DROPS = 100_000_000_000_000_000n;
const MINIMUM_ABSOLUTE_LEDGER_INDEX = 32_570;
const UINT32_MAX = 4_294_967_295;
const XAMAN_CUSTOM_IDENTIFIER_MAX_LENGTH = 40;

const recordSchema = z.record(z.string(), z.unknown());

const createdPayloadSchema = z.object({
  uuid: z.string().uuid(),
  next: z.object({
    always: z.string().min(1),
  }),
  refs: z.object({
    qr_png: z.string().min(1),
    websocket_status: z.string().min(1),
  }),
  pushed: z.boolean(),
});

const environmentNetworkIdSchema = z
  .union([
    z.number().int().nonnegative(),
    z
      .string()
      .regex(/^(0|[1-9][0-9]*)$/)
      .transform(Number),
  ])
  .nullish()
  .transform((value) => value ?? null);

const authoritativePayloadSchema = z.object({
  meta: z.object({
    exists: z.literal(true),
    uuid: z.string().uuid(),
    resolved: z.boolean(),
    signed: z.boolean(),
    cancelled: z.boolean(),
    expired: z.boolean(),
    force_network: z.string().nullish(),
  }),
  application: z.object({
    uuidv4: z.string().uuid(),
    issued_user_token: z.string().nullable(),
  }),
  payload: z.object({
    tx_type: z.string(),
    request_json: recordSchema,
  }),
  response: z.object({
    account: z.string().nullable(),
    hex: z.string().nullable(),
    txid: z.string().nullable(),
    environment_nodetype: z.string().nullable(),
    environment_networkid: environmentNetworkIdSchema,
    dispatched_nodetype: z.string().nullable(),
    dispatched_result: z.string().nullable(),
  }),
  custom_meta: z.object({
    identifier: z.string().nullable(),
  }),
});

function assertIdentifier(value: string, label: string): void {
  if (value.length < 1 || value.length > 128) {
    throw new XamanBoundaryError(
      'INVALID_PAYLOAD_INPUT',
      `${label} must contain between 1 and 128 characters`,
    );
  }
}

export type XamanCustomIdentifierKind = 'SIGN_IN' | 'PAYMENT' | 'RECOVERY';

/**
 * Xaman accepts at most 40 characters for custom_meta.identifier. Keep short
 * local fixture IDs readable, while reducing production UUIDs to a
 * collision-resistant, deterministic value that remains bound to their kind.
 */
export function xamanCustomIdentifier(kind: XamanCustomIdentifierKind, resourceId: string): string {
  assertIdentifier(resourceId, 'resourceId');
  const prefix = kind === 'SIGN_IN' ? 'signin' : kind === 'PAYMENT' ? 'payment' : 'recovery';
  const readable = `${prefix}:${resourceId}`;
  if (readable.length <= XAMAN_CUSTOM_IDENTIFIER_MAX_LENGTH) return readable;

  const compactPrefix = kind === 'SIGN_IN' ? 's' : kind === 'PAYMENT' ? 'p' : 'r';
  const digest = createHash('sha256')
    .update(`${kind}:${resourceId}`, 'utf8')
    .digest('base64url')
    .slice(0, XAMAN_CUSTOM_IDENTIFIER_MAX_LENGTH - compactPrefix.length - 1);
  return `${compactPrefix}:${digest}`;
}

function assertReturnUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new XamanBoundaryError('INVALID_PAYLOAD_INPUT', 'returnUrl must be an absolute URL');
  }

  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new XamanBoundaryError(
      'INVALID_PAYLOAD_INPUT',
      'returnUrl must use HTTPS outside localhost',
    );
  }
}

function assertProviderUrl(
  value: string,
  allowedProtocols: ReadonlySet<string>,
  field: 'deeplink' | 'QR image' | 'status WebSocket',
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new XamanBoundaryError(
      'INVALID_PROVIDER_RESPONSE',
      `Xaman ${field} URL is not an absolute URL`,
    );
  }

  if (!allowedProtocols.has(url.protocol) || url.username.length > 0 || url.password.length > 0) {
    throw new XamanBoundaryError('INVALID_PROVIDER_RESPONSE', `Xaman ${field} URL is unsafe`);
  }

  return url.toString();
}

export function buildXamanSignInPayload(input: XamanSignInPayloadInput): XamanPayloadRequest {
  assertIdentifier(input.payerSessionId, 'payerSessionId');
  assertReturnUrl(input.returnUrl);

  return {
    txjson: {
      TransactionType: 'SignIn',
    },
    options: {
      submit: false,
      force_network: XAMAN_TESTNET,
      expire: 5,
      return_url: {
        app: input.returnUrl,
        web: input.returnUrl,
      },
    },
    custom_meta: {
      identifier: xamanCustomIdentifier('SIGN_IN', input.payerSessionId),
      instruction: 'Confirm your XRP Testnet account for PayMorph.',
    },
  };
}

export function buildXamanPaymentPayload(input: XamanPaymentPayloadInput): XamanPayloadRequest {
  return buildXamanPaymentRequest(input, {
    memoOpcode: 'FE',
    identifier: xamanCustomIdentifier('PAYMENT', input.attemptId),
    instruction: 'Pay the exact XRP Testnet amount to complete this PayMorph checkout.',
  });
}

export function buildXamanRecoveryPayload(input: XamanRecoveryPayloadInput): XamanPayloadRequest {
  return buildXamanPaymentRequest(input, {
    memoOpcode: 'E0',
    identifier: xamanCustomIdentifier('RECOVERY', input.attemptId),
    instruction:
      'Recovery: mint test FXRP to your personal account and skip the failed merchant instruction.',
  });
}

function buildXamanPaymentRequest(
  input: XamanPaymentPayloadInput | XamanRecoveryPayloadInput,
  metadata: {
    memoOpcode: 'E0' | 'FE';
    identifier: string;
    instruction: string;
  },
): XamanPayloadRequest {
  assertIdentifier(input.attemptId, 'attemptId');
  assertReturnUrl(input.returnUrl);

  if (!CLASSIC_ADDRESS.test(input.destination)) {
    throw new XamanBoundaryError(
      'INVALID_PAYLOAD_INPUT',
      'destination must be a classic XRPL r-address',
    );
  }
  if (!CANONICAL_POSITIVE_INTEGER.test(input.amountDrops)) {
    throw new XamanBoundaryError(
      'INVALID_PAYLOAD_INPUT',
      'amountDrops must be a canonical positive drops string',
    );
  }
  if (BigInt(input.amountDrops) > MAX_XRP_DROPS) {
    throw new XamanBoundaryError(
      'INVALID_PAYLOAD_INPUT',
      'amountDrops exceeds the total XRP supply',
    );
  }
  if (
    !Number.isSafeInteger(input.lastLedgerSequence) ||
    input.lastLedgerSequence < MINIMUM_ABSOLUTE_LEDGER_INDEX ||
    input.lastLedgerSequence > UINT32_MAX
  ) {
    throw new XamanBoundaryError(
      'INVALID_PAYLOAD_INPUT',
      'lastLedgerSequence must be an absolute XRPL UInt32 ledger index',
    );
  }

  const memoHex = input.memoHex.startsWith('0x') ? input.memoHex.slice(2) : input.memoHex;
  if (
    !HASH_INSTRUCTION_MEMO.test(memoHex) ||
    !memoHex.toUpperCase().startsWith(metadata.memoOpcode)
  ) {
    throw new XamanBoundaryError(
      'INVALID_PAYLOAD_INPUT',
      `memoHex must be the exact 42-byte 0x${metadata.memoOpcode} instruction memo`,
    );
  }

  const base: XamanPayloadRequest = {
    txjson: {
      TransactionType: 'Payment',
      Destination: input.destination,
      Amount: input.amountDrops,
      LastLedgerSequence: input.lastLedgerSequence,
      Memos: [{ Memo: { MemoData: memoHex.toUpperCase() } }],
    },
    options: {
      submit: true,
      force_network: XAMAN_TESTNET,
      expire: 5,
      return_url: {
        app: input.returnUrl,
        web: input.returnUrl,
      },
    },
    custom_meta: {
      identifier: metadata.identifier,
      instruction: metadata.instruction,
    },
  };

  return input.userToken === undefined ? base : { ...base, user_token: input.userToken };
}

export function normalizeCreatedXamanPayload(raw: unknown): XamanCreatedPayload {
  const parsed = createdPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new XamanBoundaryError(
      'INVALID_PROVIDER_RESPONSE',
      'Xaman create response does not match the expected schema',
    );
  }

  return {
    uuid: parsed.data.uuid,
    nextUrl: assertProviderUrl(
      parsed.data.next.always,
      new Set(['https:', 'xaman:', 'xumm:']),
      'deeplink',
    ),
    qrPngUrl: assertProviderUrl(parsed.data.refs.qr_png, new Set(['https:']), 'QR image'),
    websocketUrl: assertProviderUrl(
      parsed.data.refs.websocket_status,
      new Set(['wss:']),
      'status WebSocket',
    ),
    pushed: parsed.data.pushed,
  };
}

function normalizePayloadKind(txType: string): XamanPayloadKind {
  if (txType === 'SignIn') {
    return 'SIGN_IN';
  }
  if (txType === 'Payment') {
    return 'PAYMENT';
  }
  throw new XamanBoundaryError(
    'INVALID_PROVIDER_RESPONSE',
    `Unexpected Xaman payload transaction type: ${txType}`,
  );
}

export function normalizeAuthoritativeXamanPayload(
  raw: unknown,
  expected: XamanResolvedExpectation,
): XamanAuthoritativePayload {
  const parsed = authoritativePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new XamanBoundaryError(
      'INVALID_PROVIDER_RESPONSE',
      `Xaman payload response is invalid: ${z.prettifyError(parsed.error)}`,
    );
  }

  const data = parsed.data;
  const kind = normalizePayloadKind(data.payload.tx_type);
  const customIdentifier = data.custom_meta.identifier;
  const expectedTransactionType = kind === 'SIGN_IN' ? 'SignIn' : 'Payment';

  if (data.meta.uuid !== expected.uuid) {
    throw new XamanBoundaryError('PAYLOAD_MISMATCH', 'Xaman payload UUID does not match');
  }
  if (data.application.uuidv4 !== expected.applicationId) {
    throw new XamanBoundaryError('PAYLOAD_MISMATCH', 'Xaman application UUID does not match');
  }
  if (kind !== expected.kind) {
    throw new XamanBoundaryError('PAYLOAD_MISMATCH', 'Xaman payload kind does not match');
  }
  if (customIdentifier !== expected.customIdentifier) {
    throw new XamanBoundaryError('PAYLOAD_MISMATCH', 'Xaman custom identifier does not match');
  }
  if (data.payload.request_json.TransactionType !== expectedTransactionType) {
    throw new XamanBoundaryError(
      'PAYLOAD_MISMATCH',
      'Xaman request transaction type does not match its payload type',
    );
  }
  if (data.meta.force_network !== XAMAN_TESTNET) {
    throw new XamanBoundaryError('PAYLOAD_MISMATCH', 'Xaman payload was not forced to TESTNET');
  }
  if ((expected.requireSigned ?? true) && (!data.meta.resolved || !data.meta.signed)) {
    throw new XamanBoundaryError('PAYLOAD_MISMATCH', 'Xaman payload is not resolved and signed');
  }
  if (
    data.meta.signed &&
    (data.response.account === null ||
      !CLASSIC_ADDRESS.test(data.response.account) ||
      data.response.hex === null ||
      !HEX_BLOB.test(data.response.hex))
  ) {
    throw new XamanBoundaryError(
      'INVALID_PROVIDER_RESPONSE',
      'Signed Xaman payload is missing valid account or signed-blob evidence',
    );
  }
  if (
    kind === 'SIGN_IN' &&
    data.meta.signed &&
    data.response.environment_nodetype !== XAMAN_TESTNET
  ) {
    throw new XamanBoundaryError(
      'PAYLOAD_MISMATCH',
      'Xaman SignIn was not signed in a TESTNET environment',
    );
  }
  if (
    kind === 'PAYMENT' &&
    data.meta.signed &&
    (data.response.txid === null ||
      !HEX_64.test(data.response.txid) ||
      data.response.dispatched_nodetype !== XAMAN_TESTNET)
  ) {
    throw new XamanBoundaryError(
      'PAYLOAD_MISMATCH',
      'Signed Xaman Payment lacks a TESTNET transaction dispatch',
    );
  }

  return {
    uuid: data.meta.uuid,
    applicationId: data.application.uuidv4,
    kind,
    customIdentifier,
    request: Object.freeze({ ...data.payload.request_json }),
    resolved: data.meta.resolved,
    signed: data.meta.signed,
    cancelled: data.meta.cancelled,
    expired: data.meta.expired,
    forceNetwork: data.meta.force_network ?? null,
    account: data.response.account,
    signedBlob: data.response.hex,
    transactionHash: data.response.txid,
    environmentNodeType: data.response.environment_nodetype,
    environmentNetworkId: data.response.environment_networkid,
    dispatchedNodeType: data.response.dispatched_nodetype,
    dispatchedResult: data.response.dispatched_result,
    issuedUserToken: data.application.issued_user_token,
  };
}
