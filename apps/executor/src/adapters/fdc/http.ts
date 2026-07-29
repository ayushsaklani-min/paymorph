import type { FdcHttpClient, FdcHttpResponse } from './types.js';

export class FetchFdcHttpClient implements FdcHttpClient {
  async postJson(
    url: string,
    body: unknown,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<FdcHttpResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const rawBody = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = undefined;
    }
    return {
      status: response.status,
      body: parsed,
      rawBody,
    };
  }
}
