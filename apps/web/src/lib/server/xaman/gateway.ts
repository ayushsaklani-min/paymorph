import { Xumm } from 'xumm';
import { normalizeAuthoritativeXamanPayload, normalizeCreatedXamanPayload } from './payloads.js';
import {
  XamanBoundaryError,
  type XamanAuthoritativePayload,
  type XamanCreatedPayload,
  type XamanPayloadRequest,
  type XamanResolvedExpectation,
} from './types.js';

export interface XamanGatewayConfig {
  apiKey: string;
  apiSecret: string;
}

export class XamanGateway {
  readonly #client: Xumm;

  constructor(config: XamanGatewayConfig) {
    if (config.apiKey.length === 0 || config.apiSecret.length === 0) {
      throw new XamanBoundaryError(
        'INVALID_CONFIGURATION',
        'Xaman API key and secret are required',
      );
    }
    this.#client = new Xumm(config.apiKey, config.apiSecret);
  }

  async #waitForPayloadApi(): Promise<void> {
    await this.#client.environment.ready;
    if (this.#client.payload === undefined) {
      throw new XamanBoundaryError('INVALID_CONFIGURATION', 'Xaman payload API did not initialize');
    }
  }

  async createPayload(request: XamanPayloadRequest): Promise<XamanCreatedPayload> {
    await this.#waitForPayloadApi();
    const payload = this.#client.payload;
    if (payload === undefined) {
      throw new XamanBoundaryError('INVALID_CONFIGURATION', 'Xaman payload API did not initialize');
    }
    return normalizeCreatedXamanPayload(await payload.create(request, true));
  }

  async getAuthoritativePayload(
    expected: XamanResolvedExpectation,
  ): Promise<XamanAuthoritativePayload> {
    await this.#waitForPayloadApi();
    const payload = this.#client.payload;
    if (payload === undefined) {
      throw new XamanBoundaryError('INVALID_CONFIGURATION', 'Xaman payload API did not initialize');
    }
    return normalizeAuthoritativeXamanPayload(await payload.get(expected.uuid, true), expected);
  }
}
