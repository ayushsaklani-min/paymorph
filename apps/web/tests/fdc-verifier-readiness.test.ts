import { describe, expect, it, vi } from 'vitest';
import { FdcVerifierReadiness } from '../src/lib/server/fdc/verifier-readiness.js';

const indexerState = {
  status: 200,
  data: {
    top_indexed_block: { height: 19_526_050 },
  },
};

describe('FdcVerifierReadiness', () => {
  it('requires an authenticated XRP indexer response before reporting ready', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(indexerState), { status: 200 }));
    const readiness = new FdcVerifierReadiness(
      {
        apiKey: 'public-test-key',
        verifierUrl: 'https://fdc-verifiers-testnet.flare.network',
      },
      fetchFn,
    );

    await readiness.assertReady();

    expect(fetchFn).toHaveBeenCalledWith(
      'https://fdc-verifiers-testnet.flare.network/verifier/xrp/api/indexer/state',
      expect.objectContaining({ headers: { 'X-API-KEY': 'public-test-key' } }),
    );
  });

  it('caches only a successful authenticated readiness response', async () => {
    let now = 1_000;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(indexerState), { status: 200 }));
    const readiness = new FdcVerifierReadiness(
      { apiKey: 'public-test-key', verifierUrl: 'https://verifier.example' },
      fetchFn,
      () => now,
    );

    await readiness.assertReady();
    now += 1_000;
    await readiness.assertReady();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects unavailable or malformed verifier responses', async () => {
    const unauthorized = new FdcVerifierReadiness(
      { apiKey: 'missing-key', verifierUrl: 'https://verifier.example' },
      vi.fn<typeof fetch>().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    );
    const malformed = new FdcVerifierReadiness(
      { apiKey: 'public-test-key', verifierUrl: 'https://verifier.example' },
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 200 }))),
    );

    await expect(unauthorized.assertReady()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(malformed.assertReady()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
