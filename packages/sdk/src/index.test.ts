import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayMorphClient } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PayMorphClient payment-link helpers', () => {
  it('uses scoped versioned routes and caller-provided idempotency keys', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { ok: true }, error: null, requestId: 'request-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new PayMorphClient('pm_test_example', 'https://merchant.example');

    await client.createPaymentLink(
      { name: 'Collection link' },
      '00000000-0000-4000-8000-000000000001',
    );
    await client.listPaymentLinks(new URLSearchParams({ limit: '25', status: 'ACTIVE' }));
    await client.createPaymentLinkCheckout('link-id', '00000000-0000-4000-8000-000000000002');
    await client.archivePaymentLink('link-id', '00000000-0000-4000-8000-000000000003');
    await client.listPayments();
    await client.getPaymentReceipt('attempt-id');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://merchant.example/api/v1/payment-links', {
      method: 'POST',
      headers: {
        authorization: 'Bearer pm_test_example',
        'content-type': 'application/json',
        'idempotency-key': '00000000-0000-4000-8000-000000000001',
      },
      body: '{"name":"Collection link"}',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://merchant.example/api/v1/payment-links?limit=25&status=ACTIVE',
      {
        headers: {
          authorization: 'Bearer pm_test_example',
          'content-type': 'application/json',
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://merchant.example/api/v1/payment-links/link-id/checkout',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer pm_test_example',
          'content-type': 'application/json',
          'idempotency-key': '00000000-0000-4000-8000-000000000002',
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://merchant.example/api/v1/payment-links/link-id/archive',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer pm_test_example',
          'content-type': 'application/json',
          'idempotency-key': '00000000-0000-4000-8000-000000000003',
        },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(5, 'https://merchant.example/api/v1/payments', {
      headers: {
        authorization: 'Bearer pm_test_example',
        'content-type': 'application/json',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'https://merchant.example/api/v1/payments/attempt-id/receipt',
      {
        headers: {
          authorization: 'Bearer pm_test_example',
          'content-type': 'application/json',
        },
      },
    );
  });
});
