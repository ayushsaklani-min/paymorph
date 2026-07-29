import { describe, expect, it } from 'vitest';
import {
  createPayerSessionToken,
  hashPayerSessionToken,
  readPayerSessionToken,
} from '../src/lib/server/payer-session/cookie.js';
import { statusFromAuthoritativePayload } from '../src/lib/server/payer-session/service.js';
import type { XamanAuthoritativePayload } from '../src/lib/server/xaman/types.js';

function authoritative(
  overrides: Partial<XamanAuthoritativePayload> = {},
): XamanAuthoritativePayload {
  return {
    uuid: '22222222-2222-4222-8222-222222222222',
    applicationId: '11111111-1111-4111-8111-111111111111',
    kind: 'SIGN_IN',
    customIdentifier: 'signin:payer-session-1',
    request: Object.freeze({ TransactionType: 'SignIn' }),
    resolved: false,
    signed: false,
    cancelled: false,
    expired: false,
    forceNetwork: 'TESTNET',
    account: null,
    signedBlob: null,
    transactionHash: null,
    environmentNodeType: null,
    environmentNetworkId: null,
    dispatchedNodeType: null,
    dispatchedResult: null,
    issuedUserToken: null,
    ...overrides,
  };
}

describe('payer session cookie', () => {
  it('creates opaque 256-bit tokens and stores only stable hashes', () => {
    const first = createPayerSessionToken();
    const second = createPayerSessionToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashPayerSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPayerSessionToken(first)).toBe(hashPayerSessionToken(first));
    expect(hashPayerSessionToken(first)).not.toContain(first);
  });

  it('reads only a correctly shaped payer cookie', () => {
    const token = createPayerSessionToken();
    const request = new Request('https://paymorph.example/pay/example', {
      headers: { cookie: `other=value; paymorph_payer=${token}; theme=dark` },
    });
    expect(readPayerSessionToken(request)).toBe(token);

    const malformed = new Request('https://paymorph.example/pay/example', {
      headers: { cookie: 'paymorph_payer=attacker-controlled' },
    });
    expect(readPayerSessionToken(malformed)).toBeNull();
  });
});

describe('authoritative SignIn status', () => {
  const now = new Date('2026-07-27T00:00:00.000Z');
  const future = new Date('2026-07-27T00:05:00.000Z');

  it('does not identify a payer from an unresolved provider payload', () => {
    expect(statusFromAuthoritativePayload(authoritative(), future, now)).toBe('CREATED');
  });

  it('requires authoritative resolved-and-signed state', () => {
    expect(
      statusFromAuthoritativePayload(authoritative({ resolved: true, signed: true }), future, now),
    ).toBe('SIGNED');
    expect(
      statusFromAuthoritativePayload(authoritative({ resolved: true, signed: false }), future, now),
    ).toBe('REJECTED');
  });

  it('expires unresolved local payloads without overriding signed truth', () => {
    const past = new Date('2026-07-26T23:59:59.000Z');
    expect(statusFromAuthoritativePayload(authoritative(), past, now)).toBe('EXPIRED');
    expect(
      statusFromAuthoritativePayload(authoritative({ resolved: true, signed: true }), past, now),
    ).toBe('SIGNED');
  });
});
