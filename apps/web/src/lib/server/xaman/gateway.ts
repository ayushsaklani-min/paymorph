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

  async #payloadApi(): Promise<NonNullable<Xumm['payload']>> {
    await this.#client.environment.ready;
    const payload = this.#client.payload;
    if (payload === undefined) {
      throw new XamanBoundaryError('INVALID_CONFIGURATION', 'Xaman payload API did not initialize');
    }
    return payload;
  }

  async createPayload(request: XamanPayloadRequest): Promise<XamanCreatedPayload> {
    const api = await this.#payloadApi();
    return normalizeCreatedXamanPayload(await api.create(request));
  }

  async getAuthoritativePayload(
    expected: XamanResolvedExpectation,
  ): Promise<XamanAuthoritativePayload> {
    const api = await this.#payloadApi();
    return normalizeAuthoritativeXamanPayload(await api.get(expected.uuid), expected);
  }
}
