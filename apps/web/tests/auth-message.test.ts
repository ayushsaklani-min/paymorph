import { describe, expect, it } from 'vitest';
import { createMerchantAuthMessage } from '../src/lib/server/auth/message.js';

describe('merchant authentication message', () => {
  it('binds domain, checksummed wallet, nonce, expiry, and Coston2 chain', () => {
    const message = createMerchantAuthMessage({
      domain: 'https://paymorph.example',
      walletAddress: '0x1111111111111111111111111111111111111111',
      nonce: 'nonce-value',
      issuedAt: new Date('2026-07-27T00:00:00.000Z'),
      expiration: new Date('2026-07-27T00:05:00.000Z'),
      chainId: 114,
    });
    expect(message).toContain('paymorph.example wants you to sign in');
    expect(message).toContain('Chain ID: 114');
    expect(message).toContain('Nonce: nonce-value');
    expect(message).toContain('Expiration Time: 2026-07-27T00:05:00.000Z');
  });
});
