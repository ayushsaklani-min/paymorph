import { createHash, randomBytes } from 'node:crypto';
import { db, type Merchant } from '@paymorph/db';
import { cookies } from 'next/headers';
import { DomainError } from '@paymorph/shared';

export const MERCHANT_SESSION_COOKIE = 'paymorph_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createMerchantSession(merchantId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      merchantId,
      tokenHash: hashOpaqueToken(token),
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(MERCHANT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.APP_ENV !== 'development',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearMerchantSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(MERCHANT_SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashOpaqueToken(token) } });
  }
  store.delete(MERCHANT_SESSION_COOKIE);
}

export async function requireMerchant(): Promise<Merchant> {
  const store = await cookies();
  const token = store.get(MERCHANT_SESSION_COOKIE)?.value;
  if (!token) {
    throw new DomainError('UNAUTHENTICATED', 'Merchant session required');
  }
  const session = await db.session.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { merchant: true },
  });
  if (!session || session.expiresAt <= new Date()) {
    throw new DomainError('UNAUTHENTICATED', 'Merchant session expired');
  }
  return session.merchant;
}
