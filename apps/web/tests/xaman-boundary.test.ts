import { describe, expect, it } from 'vitest';
import {
  buildXamanPaymentPayload,
  buildXamanSignInPayload,
  normalizeAuthoritativeXamanPayload,
} from '../src/lib/server/xaman/payloads.js';
import {
  computeXamanWebhookSignature,
  verifyXamanWebhook,
} from '../src/lib/server/xaman/webhook.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const PAYLOAD_ID = '22222222-2222-4222-8222-222222222222';
const REFERENCE_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = 'rMmTCjGFRWPz8S2zAUUoNVSQHxtRQD4eCx';
const DESTINATION = 'r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV';
const TX_HASH = 'A'.repeat(64);
const MEMO_HEX = `FE00${'00'.repeat(8)}${'11'.repeat(32)}`;

describe('Xaman payload construction', () => {
  it('builds a forced-Testnet SignIn request without ledger submission', () => {
    expect(
      buildXamanSignInPayload({
        payerSessionId: 'payer-session-1',
        returnUrl: 'https://paymorph.example/pay/example/status',
      }),
    ).toEqual({
      txjson: { TransactionType: 'SignIn' },
      options: {
        submit: false,
        force_network: 'TESTNET',
        expire: 5,
        return_url: {
          app: 'https://paymorph.example/pay/example/status',
          web: 'https://paymorph.example/pay/example/status',
        },
      },
      custom_meta: {
        identifier: 'signin:payer-session-1',
        instruction: 'Confirm your XRP Testnet account for PayMorph.',
      },
    });
  });

  it('builds an exact singleton 0xFE Payment memo and omits unsafe fields', () => {
    const payload = buildXamanPaymentPayload({
      attemptId: 'attempt-1',
      destination: DESTINATION,
      amountDrops: '1000001',
      memoHex: `0x${MEMO_HEX.toLowerCase()}`,
      lastLedgerSequence: 90_000_123,
      returnUrl: 'https://paymorph.example/status/attempt-1',
    });

    expect(payload.txjson).toEqual({
      TransactionType: 'Payment',
      Destination: DESTINATION,
      Amount: '1000001',
      LastLedgerSequence: 90_000_123,
      Memos: [{ Memo: { MemoData: MEMO_HEX } }],
    });
    expect(payload.options).toMatchObject({ submit: true, force_network: 'TESTNET' });
    expect(payload.txjson).not.toHaveProperty('Account');
    expect(payload.txjson).not.toHaveProperty('DestinationTag');
    expect(payload.txjson).not.toHaveProperty('NetworkID');
  });

  it('rejects relative LastLedgerSequence and malformed memo inputs', () => {
    const input = {
      attemptId: 'attempt-1',
      destination: DESTINATION,
      amountDrops: '1000001',
      memoHex: MEMO_HEX,
      lastLedgerSequence: 20,
      returnUrl: 'https://paymorph.example/status/attempt-1',
    };

    expect(() => buildXamanPaymentPayload(input)).toThrow(/absolute XRPL UInt32/);
    expect(() =>
      buildXamanPaymentPayload({
        ...input,
        lastLedgerSequence: 90_000_123,
        memoHex: `FF${MEMO_HEX.slice(2)}`,
      }),
    ).toThrow(/42-byte 0xFE/);
  });
});

describe('authoritative Xaman payload normalization', () => {
  it('accepts an unresolved SignIn before an environment has been selected', () => {
    const normalized = normalizeAuthoritativeXamanPayload(
      {
        meta: {
          exists: true,
          uuid: PAYLOAD_ID,
          resolved: false,
          signed: false,
          cancelled: false,
          expired: false,
          force_network: 'TESTNET',
        },
        application: { uuidv4: APPLICATION_ID, issued_user_token: null },
        payload: {
          tx_type: 'SignIn',
          request_json: { TransactionType: 'SignIn' },
        },
        response: {
          account: null,
          hex: null,
          txid: null,
          environment_nodetype: null,
          environment_networkid: null,
          dispatched_nodetype: null,
          dispatched_result: null,
        },
        custom_meta: { identifier: 'signin:payer-session-1' },
      },
      {
        uuid: PAYLOAD_ID,
        applicationId: APPLICATION_ID,
        kind: 'SIGN_IN',
        customIdentifier: 'signin:payer-session-1',
        requireSigned: false,
      },
    );

    expect(normalized.resolved).toBe(false);
    expect(normalized.account).toBeNull();
  });

  it('normalizes a resolved SignIn and checks its app, identifier, and environment', () => {
    const normalized = normalizeAuthoritativeXamanPayload(
      {
        meta: {
          exists: true,
          uuid: PAYLOAD_ID,
          resolved: true,
          signed: true,
          cancelled: false,
          expired: false,
          force_network: 'TESTNET',
        },
        application: { uuidv4: APPLICATION_ID, issued_user_token: null },
        payload: {
          tx_type: 'SignIn',
          request_json: { TransactionType: 'SignIn' },
        },
        response: {
          account: ACCOUNT,
          hex: 'DEADBEEF',
          txid: null,
          environment_nodetype: 'TESTNET',
          environment_networkid: 1,
          dispatched_nodetype: null,
          dispatched_result: null,
        },
        custom_meta: { identifier: 'signin:payer-session-1' },
      },
      {
        uuid: PAYLOAD_ID,
        applicationId: APPLICATION_ID,
        kind: 'SIGN_IN',
        customIdentifier: 'signin:payer-session-1',
      },
    );

    expect(normalized.account).toBe(ACCOUNT);
    expect(normalized.environmentNetworkId).toBe(1);
    expect(normalized.transactionHash).toBeNull();
  });

  it('rejects a Payment dispatched on the wrong network', () => {
    expect(() =>
      normalizeAuthoritativeXamanPayload(
        {
          meta: {
            exists: true,
            uuid: PAYLOAD_ID,
            resolved: true,
            signed: true,
            cancelled: false,
            expired: false,
            force_network: 'TESTNET',
          },
          application: { uuidv4: APPLICATION_ID, issued_user_token: null },
          payload: {
            tx_type: 'Payment',
            request_json: { TransactionType: 'Payment' },
          },
          response: {
            account: ACCOUNT,
            hex: 'DEADBEEF',
            txid: TX_HASH,
            environment_nodetype: 'MAINNET',
            environment_networkid: 0,
            dispatched_nodetype: 'MAINNET',
            dispatched_result: 'tesSUCCESS',
          },
          custom_meta: { identifier: 'payment:attempt-1' },
        },
        {
          uuid: PAYLOAD_ID,
          applicationId: APPLICATION_ID,
          kind: 'PAYMENT',
          customIdentifier: 'payment:attempt-1',
        },
      ),
    ).toThrow(/TESTNET transaction dispatch/);
  });
});

describe('Xaman webhook verification', () => {
  const timestamp = '1785100000';
  const nowMs = 1_785_100_000_000;
  const secret = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const body = {
    meta: {
      application_uuidv4: APPLICATION_ID,
      payload_uuidv4: PAYLOAD_ID,
    },
    payloadResponse: {
      payload_uuidv4: PAYLOAD_ID,
      reference_call_uuidv4: REFERENCE_ID,
      signed: true,
      txid: TX_HASH,
    },
  };

  it('checks the documented HMAC and returns only notification identifiers', () => {
    const signature = computeXamanWebhookSignature(secret, timestamp, body);
    expect(signature).toBe('536b4e7ca433f2976c97bd7d3ae210caff9efc3d');

    expect(
      verifyXamanWebhook({
        body,
        timestampHeader: timestamp,
        signatureHeader: signature,
        applicationSecret: secret,
        expectedApplicationId: APPLICATION_ID,
        nowMs,
      }),
    ).toEqual({
      applicationId: APPLICATION_ID,
      payloadUuid: PAYLOAD_ID,
      referenceCallUuid: REFERENCE_ID,
      signed: true,
      transactionHash: TX_HASH,
    });
  });

  it('rejects tampering and stale replay attempts', () => {
    const signature = computeXamanWebhookSignature(secret, timestamp, body);

    expect(() =>
      verifyXamanWebhook({
        body: { ...body, payloadResponse: { ...body.payloadResponse, signed: false } },
        timestampHeader: timestamp,
        signatureHeader: signature,
        applicationSecret: secret,
        expectedApplicationId: APPLICATION_ID,
        nowMs,
      }),
    ).toThrow(/signature/);

    expect(() =>
      verifyXamanWebhook({
        body,
        timestampHeader: timestamp,
        signatureHeader: signature,
        applicationSecret: secret,
        expectedApplicationId: APPLICATION_ID,
        nowMs: nowMs + 6 * 60 * 1_000,
      }),
    ).toThrow(/Stale/);
  });
});
