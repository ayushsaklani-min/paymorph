import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptionContext {
  key: Buffer;
  aad: string;
}

export function parseEncryptionKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) {
    throw new TypeError('Encryption key must be exactly 32 bytes encoded as base64');
  }
  return key;
}

export function encryptSensitive(plaintext: Uint8Array, context: EncryptionContext): string {
  if (context.key.length !== 32) throw new TypeError('AES-256-GCM requires a 32-byte key');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', context.key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(context.aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSensitive(envelope: string, context: EncryptionContext): Buffer {
  if (context.key.length !== 32) throw new TypeError('AES-256-GCM requires a 32-byte key');
  const [version, ivValue, tagValue, ciphertextValue, extra] = envelope.split(':');
  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    ciphertextValue === undefined ||
    extra !== undefined
  ) {
    throw new TypeError('Invalid encrypted envelope');
  }
  const iv = Buffer.from(ivValue, 'base64url');
  const tag = Buffer.from(tagValue, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new TypeError('Invalid encrypted envelope parameters');
  }
  const decipher = createDecipheriv('aes-256-gcm', context.key, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(context.aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]);
}
