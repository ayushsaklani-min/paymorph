import { describe, expect, it } from 'vitest';
import { requireOperator } from '../src/lib/server/auth/operator.js';

const TOKEN = 'operator-token-with-at-least-thirty-two-bytes';

describe('operator authentication', () => {
  it('accepts only the separate operator cookie', () => {
    const request = new Request('https://paymorph.example/api/admin/attempts', {
      headers: { cookie: `paymorph_operator=${encodeURIComponent(TOKEN)}` },
    });
    expect(() => requireOperator(request, TOKEN)).not.toThrow();
  });

  it('does not treat a merchant cookie as operator authority', () => {
    const request = new Request('https://paymorph.example/api/admin/attempts', {
      headers: { cookie: `paymorph_session=${encodeURIComponent(TOKEN)}` },
    });
    expect(() => requireOperator(request, TOKEN)).toThrow(/Operator session required/);
  });

  it('fails closed when operator authentication is not configured', () => {
    const request = new Request('https://paymorph.example/api/admin/attempts');
    expect(() => requireOperator(request, undefined)).toThrow(/not configured/);
  });
});
