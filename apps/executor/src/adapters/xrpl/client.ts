import { Client } from 'xrpl';
import { XRPL_TESTNET_WEBSOCKET_URL, XrplValidationError } from './types.js';

const HASH_256 = /^[A-Fa-f0-9]{64}$/;

export interface XrplTransactionClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  request(
    request:
      | {
          command: 'tx';
          transaction: string;
          binary: false;
          api_version: 2;
        }
      | { command: 'server_info' },
  ): Promise<unknown>;
}

export class XrplTestnetTransactionReader {
  readonly #client: XrplTransactionClient;

  constructor(client: XrplTransactionClient = new Client(XRPL_TESTNET_WEBSOCKET_URL)) {
    this.#client = client;
  }

  async getTransaction(transactionHash: string): Promise<unknown> {
    if (!HASH_256.test(transactionHash)) {
      throw new XrplValidationError('INVALID_EXPECTATION', 'Invalid XRPL transaction hash');
    }
    if (!this.#client.isConnected()) {
      await this.#client.connect();
    }
    return this.#client.request({
      command: 'tx',
      transaction: transactionHash,
      binary: false,
      api_version: 2,
    });
  }

  async getValidatedLedgerIndex(): Promise<number> {
    if (!this.#client.isConnected()) {
      await this.#client.connect();
    }
    const raw = await this.#client.request({ command: 'server_info' });
    const top = requireRecord(raw, 'XRPL server_info response');
    const result = requireRecord(top.result, 'XRPL server_info result');
    const info = requireRecord(result.info, 'XRPL server_info info');
    const ledger = requireRecord(info.validated_ledger, 'XRPL validated ledger');
    if (typeof ledger.seq !== 'number' || !Number.isSafeInteger(ledger.seq) || ledger.seq < 1) {
      throw new XrplValidationError(
        'INVALID_PROVIDER_RESPONSE',
        'XRPL validated ledger sequence is invalid',
      );
    }
    return ledger.seq;
  }

  async close(): Promise<void> {
    if (this.#client.isConnected()) {
      await this.#client.disconnect();
    }
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new XrplValidationError('INVALID_PROVIDER_RESPONSE', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
