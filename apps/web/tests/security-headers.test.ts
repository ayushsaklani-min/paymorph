import { describe, expect, it } from 'vitest';
import nextConfig, { securityHeaders } from '../next.config.js';

describe('web security headers', () => {
  it('applies the documented safe response headers to every route', async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([{ source: '/:path*', headers: securityHeaders }]);
    expect(
      Object.fromEntries(securityHeaders.map((header) => [header.key, header.value])),
    ).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Permitted-Cross-Domain-Policies': 'none',
    });
  });
});
