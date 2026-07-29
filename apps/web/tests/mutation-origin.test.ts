import { afterEach, describe, expect, it } from 'vitest';
import { assertMutationOrigin } from '../src/lib/server/http.js';

const previousAppUrl = process.env.APP_URL;

afterEach(() => {
  process.env.APP_URL = previousAppUrl;
});

describe('mutation origin enforcement', () => {
  it('accepts the configured application origin', () => {
    process.env.APP_URL = 'https://paymorph.example';
    const request = new Request('https://internal.example/api/invoices', {
      method: 'POST',
      headers: { origin: 'https://paymorph.example', 'sec-fetch-site': 'same-origin' },
    });
    expect(() => assertMutationOrigin(request)).not.toThrow();
  });

  it('rejects cross-origin browser mutations', () => {
    process.env.APP_URL = 'https://paymorph.example';
    const request = new Request('https://paymorph.example/api/invoices', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
    });
    expect(() => assertMutationOrigin(request)).toThrow(/Cross-site/);
  });
});
