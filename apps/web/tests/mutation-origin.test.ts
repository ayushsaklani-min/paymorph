import { afterEach, describe, expect, it } from 'vitest';
import { assertMutationOrigin } from '../src/lib/server/http.js';

const previousAppUrl = process.env.APP_URL;
const previousAllowedOrigins = process.env.MUTATION_ALLOWED_ORIGINS;

afterEach(() => {
  process.env.APP_URL = previousAppUrl;
  process.env.MUTATION_ALLOWED_ORIGINS = previousAllowedOrigins;
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

  it('accepts only explicitly configured additional origins', () => {
    process.env.APP_URL = 'https://paymorph.example';
    process.env.MUTATION_ALLOWED_ORIGINS = 'http://localhost:3000';
    const request = new Request('https://internal.example/api/invoices', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' },
    });
    expect(() => assertMutationOrigin(request)).not.toThrow();
  });
});
