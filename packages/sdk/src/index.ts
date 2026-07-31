import { createHmac, timingSafeEqual } from 'node:crypto';

export class PayMorphClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'http://localhost:3000',
  ) {}
  async listInvoices(): Promise<unknown> {
    return this.request('/api/v1/invoices');
  }
  async createInvoice(input: unknown, idempotencyKey = crypto.randomUUID()): Promise<unknown> {
    return this.request('/api/v1/invoices', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(input),
    });
  }
  async publishInvoice(id: string, idempotencyKey = crypto.randomUUID()): Promise<unknown> {
    return this.request(`/api/v1/invoices/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
    });
  }
  async listPaymentLinks(searchParams = new URLSearchParams()): Promise<unknown> {
    const query = searchParams.toString();
    return this.request(`/api/v1/payment-links${query ? `?${query}` : ''}`);
  }
  async createPaymentLink(input: unknown, idempotencyKey = crypto.randomUUID()): Promise<unknown> {
    return this.request('/api/v1/payment-links', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(input),
    });
  }
  async archivePaymentLink(id: string, idempotencyKey = crypto.randomUUID()): Promise<unknown> {
    return this.request(`/api/v1/payment-links/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
    });
  }
  async createPaymentLinkCheckout(
    id: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<unknown> {
    return this.request(`/api/v1/payment-links/${encodeURIComponent(id)}/checkout`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
    });
  }
  async listPayments(): Promise<unknown> {
    return this.request('/api/v1/payments');
  }
  async getPaymentReceipt(id: string): Promise<unknown> {
    return this.request(`/api/v1/payments/${encodeURIComponent(id)}/receipt`);
  }
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(errorMessage(body, response.status));
    if (!isObject(body) || !('data' in body))
      throw new Error('PayMorph API returned an invalid envelope');
    return body.data;
  }
}

function errorMessage(body: unknown, status: number): string {
  if (isObject(body) && isObject(body.error) && typeof body.error.message === 'string') {
    return body.error.message;
  }
  return `PayMorph API error ${status}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function verifyWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return (
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}
