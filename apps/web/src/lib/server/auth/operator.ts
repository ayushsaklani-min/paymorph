import { createHash, timingSafeEqual } from 'node:crypto';
import { DomainError } from '@paymorph/shared';

export const OPERATOR_SESSION_COOKIE = 'paymorph_operator';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function requireOperator(
  request: Request,
  expectedToken = process.env.OPERATOR_SESSION_TOKEN,
): { id: string } {
  if (!expectedToken || !TOKEN_PATTERN.test(expectedToken)) {
    throw new DomainError('INTERNAL_ERROR', 'Operator authentication is not configured');
  }
  const token = readCookie(request.headers.get('cookie'), OPERATOR_SESSION_COOKIE);
  if (!token) {
    throw new DomainError('UNAUTHENTICATED', 'Operator session required');
  }
  if (!TOKEN_PATTERN.test(token) || !safeTokenEqual(token, expectedToken)) {
    throw new DomainError('FORBIDDEN', 'Operator session is invalid');
  }
  return { id: tokenHash(expectedToken).toString('hex').slice(0, 32) };
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function safeTokenEqual(left: string, right: string): boolean {
  return timingSafeEqual(tokenHash(left), tokenHash(right));
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
