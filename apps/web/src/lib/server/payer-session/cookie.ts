import { createHash, randomBytes } from 'node:crypto';
import type { NextResponse } from 'next/server';

export const PAYER_SESSION_COOKIE = 'paymorph_payer';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createPayerSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashPayerSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function readPayerSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader === null) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== PAYER_SESSION_COOKIE) {
      continue;
    }

    const value = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : null;
  }

  return null;
}

export function setPayerSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  if (!TOKEN_PATTERN.test(token)) {
    throw new TypeError('Invalid payer session token');
  }

  response.cookies.set(PAYER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.APP_ENV !== 'development',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}
