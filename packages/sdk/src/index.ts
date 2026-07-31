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
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error?.message ?? `PayMorph API error ${response.status}`);
    return body.data;
  }
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
