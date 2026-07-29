import { DomainError } from '@paymorph/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  executeIdempotentMutation,
  hashCanonicalInput,
  type IdempotencyStore,
  type JsonObject,
} from '../src/lib/server/idempotency.js';
import { jsonError } from '../src/lib/server/http.js';

const KEY = '11111111-1111-4111-8111-111111111111';

interface MemoryRecord {
  id: string;
  requestHash: string;
  responseStatus: number | null;
  responseJson: JsonObject | null;
  expiresAt: Date;
}

function createMemoryStore(): IdempotencyStore {
  const records = new Map<string, MemoryRecord>();
  let nextId = 1;

  return {
    claim(input) {
      const key = `${input.scope}:${input.idempotencyKey}`;
      const current = records.get(key);
      if (current !== undefined && current.expiresAt <= input.now) {
        records.delete(key);
      }
      const existing = records.get(key);
      if (existing !== undefined) {
        return Promise.resolve({ kind: 'existing' as const, record: existing });
      }
      const record: MemoryRecord = {
        id: `claim-${nextId++}`,
        requestHash: input.requestHash,
        responseStatus: null,
        responseJson: null,
        expiresAt: input.expiresAt,
      };
      records.set(key, record);
      return Promise.resolve({ kind: 'claimed' as const, id: record.id });
    },

    complete(input) {
      const record = [...records.values()].find(
        (candidate) =>
          candidate.id === input.id &&
          candidate.requestHash === input.requestHash &&
          candidate.responseStatus === null,
      );
      if (record === undefined) return Promise.resolve(false);
      record.responseStatus = input.responseStatus;
      record.responseJson = input.responseJson;
      record.expiresAt = input.expiresAt;
      return Promise.resolve(true);
    },

    release(id, requestHash) {
      for (const [key, record] of records.entries()) {
        if (
          record.id === id &&
          record.requestHash === requestHash &&
          record.responseStatus === null
        ) {
          records.delete(key);
        }
      }
      return Promise.resolve();
    },
  };
}

function request(idempotencyKey = KEY): Request {
  return new Request('https://paymorph.example/api/invoices', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
  });
}

describe('canonical idempotency input', () => {
  it('is independent of object property order while preserving array order', () => {
    expect(hashCanonicalInput({ z: 1, nested: { b: true, a: 'value' } })).toBe(
      hashCanonicalInput({ nested: { a: 'value', b: true }, z: 1 }),
    );
    expect(hashCanonicalInput({ values: [1, 2] })).not.toBe(hashCanonicalInput({ values: [2, 1] }));
  });
});

describe('idempotent mutation execution', () => {
  it('maps idempotency conflicts to the documented HTTP 409 response', async () => {
    const response = jsonError(
      request(),
      new DomainError('IDEMPOTENCY_CONFLICT', 'The key is already in use'),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'IDEMPOTENCY_CONFLICT' },
    });
  });

  it('stores the first successful response and replays it without executing again', async () => {
    const store = createMemoryStore();
    const execute = vi.fn(() =>
      Promise.resolve({
        invoiceId: 'invoice-1',
        createdAt: new Date('2026-07-27T00:00:00.000Z'),
      }),
    );
    const options = {
      request: request(),
      scope: 'merchant:merchant-1:invoices:create',
      requestInput: { title: 'Invoice', recipients: [{ bps: 10_000 }] },
      successStatus: 201,
      execute,
      store,
    };

    const first = await executeIdempotentMutation(options);
    const replay = await executeIdempotentMutation({
      ...options,
      requestInput: { recipients: [{ bps: 10_000 }], title: 'Invoice' },
    });

    expect(first).toEqual({
      data: { invoiceId: 'invoice-1', createdAt: '2026-07-27T00:00:00.000Z' },
      status: 201,
      replayed: false,
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of the same scoped key with different canonical input', async () => {
    const store = createMemoryStore();
    const common = {
      request: request(),
      scope: 'payer-session:payer-1:invoice:invoice-1:quotes:create',
      successStatus: 201,
      execute: () => Promise.resolve({ quoteId: 'quote-1' }),
      store,
    };
    await executeIdempotentMutation({ ...common, requestInput: { slippageBps: 150 } });

    await expect(
      executeIdempotentMutation({ ...common, requestInput: { slippageBps: 200 } }),
    ).rejects.toThrow(/different request input/);
  });

  it('allows only one concurrent owner to perform the side effect', async () => {
    const store = createMemoryStore();
    let markStarted: (() => void) | undefined;
    let unblock: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const common = {
      request: request(),
      scope: 'payer-session:payer-1:quote:quote-1:payment-payload:create',
      requestInput: { quoteId: 'quote-1' },
      successStatus: 201,
      store,
    };
    const first = executeIdempotentMutation({
      ...common,
      execute: async () => {
        markStarted?.();
        await blocked;
        return { payloadUuid: 'payload-1' };
      },
    });
    await started;

    await expect(
      executeIdempotentMutation({
        ...common,
        execute: () => Promise.resolve({ payloadUuid: 'payload-2' }),
      }),
    ).rejects.toThrow(/still processing/);

    unblock?.();
    await expect(first).resolves.toMatchObject({
      data: { payloadUuid: 'payload-1' },
      replayed: false,
    });
  });

  it('scopes the same UUID independently to each authenticated resource', async () => {
    const store = createMemoryStore();
    const execute = vi.fn(() => Promise.resolve({ ok: true }));
    for (const scope of [
      'merchant:merchant-1:invoices:create',
      'merchant:merchant-2:invoices:create',
    ]) {
      await executeIdempotentMutation({
        request: request(),
        scope,
        requestInput: { title: 'Invoice' },
        successStatus: 201,
        execute,
        store,
      });
    }
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('requires a UUID Idempotency-Key', async () => {
    const store = createMemoryStore();
    const execute = vi.fn(() => Promise.resolve({ ok: true }));

    await expect(
      executeIdempotentMutation({
        request: new Request('https://paymorph.example/api/invoices', { method: 'POST' }),
        scope: 'merchant:merchant-1:invoices:create',
        requestInput: {},
        successStatus: 201,
        execute,
        store,
      }),
    ).rejects.toThrow();
    await expect(
      executeIdempotentMutation({
        request: request('not-a-uuid'),
        scope: 'merchant:merchant-1:invoices:create',
        requestInput: {},
        successStatus: 201,
        execute,
        store,
      }),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('can release a known-safe domain failure for a corrected retry', async () => {
    const store = createMemoryStore();
    await expect(
      executeIdempotentMutation({
        request: request(),
        scope: 'merchant:merchant-1:invoices:create',
        requestInput: { title: 'Invoice' },
        successStatus: 201,
        releaseOnDomainError: true,
        execute: () =>
          Promise.reject(new DomainError('VALIDATION_ERROR', 'Invoice expiry is too close')),
        store,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      executeIdempotentMutation({
        request: request(),
        scope: 'merchant:merchant-1:invoices:create',
        requestInput: { title: 'Invoice' },
        successStatus: 201,
        releaseOnDomainError: true,
        execute: () => Promise.resolve({ invoiceId: 'invoice-1' }),
        store,
      }),
    ).resolves.toMatchObject({ data: { invoiceId: 'invoice-1' } });
  });
});
