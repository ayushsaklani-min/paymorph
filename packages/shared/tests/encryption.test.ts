import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSensitive, encryptSensitive } from '../src/security/encryption.js';

describe('AES-256-GCM envelope', () => {
  it('round trips with record-bound additional data', () => {
    const key = randomBytes(32);
    const encrypted = encryptSensitive(Buffer.from('committed-user-operation'), {
      key,
      aad: 'quote:quote-1',
    });
    expect(decryptSensitive(encrypted, { key, aad: 'quote:quote-1' }).toString('utf8')).toBe(
      'committed-user-operation',
    );
  });

  it('rejects a different record binding', () => {
    const key = randomBytes(32);
    const encrypted = encryptSensitive(Buffer.from('token'), {
      key,
      aad: 'payer-session:one',
    });
    expect(() => decryptSensitive(encrypted, { key, aad: 'payer-session:two' })).toThrow();
  });
});
