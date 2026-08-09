import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '../src/app/api/executor/wake/route.js';

const previousAppUrl = process.env.APP_URL;
const previousWakeUrl = process.env.EXECUTOR_WAKE_URL;

afterEach(() => {
  process.env.APP_URL = previousAppUrl;
  process.env.EXECUTOR_WAKE_URL = previousWakeUrl;
});

describe('landing executor wake endpoint', () => {
  it('accepts a same-origin availability hint without requiring executor configuration', async () => {
    process.env.APP_URL = 'https://paymorph.example';
    delete process.env.EXECUTOR_WAKE_URL;

    const response = POST(
      new Request('https://paymorph.example/api/executor/wake', {
        method: 'POST',
        headers: {
          origin: 'https://paymorph.example',
          'sec-fetch-site': 'same-origin',
        },
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ data: { accepted: true }, error: null });
  });

  it('rejects a cross-site wake request', async () => {
    process.env.APP_URL = 'https://paymorph.example';

    const response = POST(
      new Request('https://paymorph.example/api/executor/wake', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      data: null,
      error: { code: 'FORBIDDEN' },
    });
  });
});
