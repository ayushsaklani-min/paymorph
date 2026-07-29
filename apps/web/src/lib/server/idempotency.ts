import { createHash } from 'node:crypto';
import { db } from '@paymorph/db';
import { DomainError } from '@paymorph/shared';
import { z } from 'zod';

const CLAIM_TTL_MS = 60 * 60 * 1_000;
const RESPONSE_TTL_MS = 24 * 60 * 60 * 1_000;

const idempotencyKeySchema = z.uuid().transform((value) => value.toLowerCase());

type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

interface StoredClaim {
  id: string;
  requestHash: string;
  responseStatus: number | null;
  responseJson: unknown;
}

interface ClaimInput {
  scope: string;
  idempotencyKey: string;
  requestHash: string;
  expiresAt: Date;
  now: Date;
}

export interface IdempotencyStore {
  claim(
    input: ClaimInput,
  ): Promise<{ kind: 'claimed'; id: string } | { kind: 'existing'; record: StoredClaim }>;
  complete(input: {
    id: string;
    requestHash: string;
    responseStatus: number;
    responseJson: JsonObject;
    expiresAt: Date;
  }): Promise<boolean>;
  release(id: string, requestHash: string): Promise<void>;
}

interface IdempotentMutationOptions {
  request: Request;
  scope: string;
  requestInput: unknown;
  successStatus: number;
  execute: () => Promise<unknown>;
  releaseOnDomainError?: boolean;
  now?: Date;
  store?: IdempotencyStore;
}

export interface IdempotentMutationResult {
  data: JsonObject;
  status: number;
  replayed: boolean;
}

export async function executeIdempotentMutation(
  options: IdempotentMutationOptions,
): Promise<IdempotentMutationResult> {
  const idempotencyKey = readIdempotencyKey(options.request);
  const requestHash = hashCanonicalInput(options.requestInput);
  const now = options.now ?? new Date();
  const store = options.store ?? prismaIdempotencyStore;
  const claim = await store.claim({
    scope: options.scope,
    idempotencyKey,
    requestHash,
    now,
    expiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
  });

  if (claim.kind === 'existing') {
    if (claim.record.requestHash !== requestHash) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used with different request input',
      );
    }
    if (claim.record.responseStatus === null) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'A request with this Idempotency-Key is still processing',
      );
    }
    if (!isJsonObject(claim.record.responseJson)) {
      throw new DomainError('INTERNAL_ERROR', 'Stored idempotency response is invalid');
    }
    return {
      data: claim.record.responseJson,
      status: claim.record.responseStatus,
      replayed: true,
    };
  }

  try {
    const data = toJsonObject(await options.execute());
    const completed = await store.complete({
      id: claim.id,
      requestHash,
      responseStatus: options.successStatus,
      responseJson: data,
      expiresAt: new Date(now.getTime() + RESPONSE_TTL_MS),
    });
    if (!completed) {
      throw new DomainError('INTERNAL_ERROR', 'Idempotency claim was lost before completion');
    }
    return { data, status: options.successStatus, replayed: false };
  } catch (error) {
    if (options.releaseOnDomainError === true && error instanceof DomainError) {
      await store.release(claim.id, requestHash);
    }
    throw error;
  }
}

export function readIdempotencyKey(request: Request): string {
  return idempotencyKeySchema.parse(request.headers.get('idempotency-key'));
}

export function hashCanonicalInput(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Canonical input contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical input must contain only plain JSON objects');
    }
    const entries = Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(',')}}`;
  }
  throw new TypeError(`Canonical input contains unsupported ${typeof value}`);
}

function toJsonObject(value: unknown): JsonObject {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError('Mutation response is not JSON serializable');
  const parsed: unknown = JSON.parse(serialized);
  if (!isJsonObject(parsed)) throw new TypeError('Mutation response must be a JSON object');
  return parsed;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

const prismaIdempotencyStore: IdempotencyStore = {
  async claim(input) {
    await db.idempotencyRecord.deleteMany({
      where: {
        scope: input.scope,
        idempotencyKey: input.idempotencyKey,
        expiresAt: { lte: input.now },
      },
    });

    try {
      const created = await db.idempotencyRecord.create({
        data: {
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          expiresAt: input.expiresAt,
        },
        select: { id: true },
      });
      return { kind: 'claimed' as const, id: created.id };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await db.idempotencyRecord.findUnique({
        where: {
          scope_idempotencyKey: {
            scope: input.scope,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: {
          id: true,
          requestHash: true,
          responseStatus: true,
          responseJson: true,
        },
      });
      if (existing === null) {
        throw new DomainError('INTERNAL_ERROR', 'Idempotency claim could not be resolved');
      }
      return { kind: 'existing' as const, record: existing };
    }
  },

  async complete(input) {
    const updated = await db.idempotencyRecord.updateMany({
      where: {
        id: input.id,
        requestHash: input.requestHash,
        responseStatus: null,
      },
      data: {
        responseStatus: input.responseStatus,
        responseJson: input.responseJson,
        expiresAt: input.expiresAt,
      },
    });
    return updated.count === 1;
  },

  async release(id, requestHash) {
    await db.idempotencyRecord.deleteMany({
      where: { id, requestHash, responseStatus: null },
    });
  },
};
