import type { Prisma } from '@paymorph/db';
import type {
  PreparedXrpPaymentRequest,
  SubmittedXrpPaymentRequest,
  XrpPaymentProof,
} from '../adapters/fdc/index.js';

const BIGINT_TAG = '$paymorphBigInt';

export function toJson(value: unknown): Prisma.InputJsonValue {
  return mapJson(value, (bigint) => ({ [BIGINT_TAG]: bigint.toString() })) as Prisma.InputJsonValue;
}

export function fromJson<T>(value: unknown): T {
  return mapJson(value, undefined) as T;
}

export function preparedFromCheckpoint(
  requestBytes: string,
  checkpoint: unknown,
): PreparedXrpPaymentRequest {
  const value = requireRecord(checkpoint, 'FDC verifier checkpoint');
  return {
    transactionId: requireHex(value.transactionId, 'transactionId'),
    proofOwner: requireAddress(value.proofOwner, 'proofOwner'),
    abiEncodedRequest: requireHex(requestBytes, 'requestBytes'),
  };
}

export function submittedFromCheckpoint(
  requestBytes: string,
  checkpoint: unknown,
  votingRoundId?: bigint,
): SubmittedXrpPaymentRequest {
  const prepared = preparedFromCheckpoint(requestBytes, checkpoint);
  const value = requireRecord(checkpoint, 'FDC submission checkpoint');
  if (votingRoundId === undefined) throw new TypeError('FDC voting round is missing');
  return {
    ...prepared,
    requestTransactionHash: requireHex(value.requestTransactionHash, 'requestTransactionHash'),
    requestBlockNumber: BigInt(
      requireIntegerString(value.requestBlockNumber, 'requestBlockNumber'),
    ),
    votingRoundId,
  };
}

export function proofFromCheckpoint(value: unknown): XrpPaymentProof {
  if (value === undefined || value === null) throw new TypeError('FDC proof checkpoint is missing');
  return fromJson<XrpPaymentProof>(value);
}

function mapJson(
  value: unknown,
  bigintEncoder?: (value: bigint) => Record<string, string>,
): unknown {
  if (typeof value === 'bigint') {
    if (!bigintEncoder) return value;
    return bigintEncoder(value);
  }
  if (Array.isArray(value)) return value.map((item) => mapJson(item, bigintEncoder));
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (
      !bigintEncoder &&
      Object.keys(record).length === 1 &&
      typeof record[BIGINT_TAG] === 'string' &&
      /^(0|[1-9]\d*)$/.test(record[BIGINT_TAG])
    ) {
      return BigInt(record[BIGINT_TAG]);
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, mapJson(item, bigintEncoder)]),
    );
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireHex(value: unknown, label: string): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new TypeError(`${label} must be hex`);
  }
  return value as `0x${string}`;
}

function requireAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new TypeError(`${label} must be an address`);
  }
  return value as `0x${string}`;
}

function requireIntegerString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${label} must be a canonical integer string`);
  }
  return value;
}
