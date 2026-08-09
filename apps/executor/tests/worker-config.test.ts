import { describe, expect, it } from 'vitest';
import { loadExecutorConfig } from '../src/worker/config.js';
import type { ExecutorConfigurationError } from '../src/worker/config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  DATA_ENCRYPTION_KEY_V1: Buffer.alloc(32, 7).toString('base64'),
  EXECUTOR_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
  XRPL_WS_URL: 'wss://s.altnet.rippletest.net:51233',
  COSTON2_RPC_URL: 'https://coston2-api.flare.network/ext/C/rpc',
  COSTON2_CHAIN_ID: '114',
  FLARE_CONTRACT_REGISTRY: '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019',
  PAYMORPH_ROUTER_ADDRESS: '0x9C7d670BE201be8a527cCDf349FE45B037eC6008',
  FDC_VERIFIER_URL: 'https://fdc-verifiers-testnet.flare.network',
  FDC_DA_LAYER_URL: 'https://ctn2-data-availability.flare.network',
};

describe('executor configuration diagnostics', () => {
  it('accepts a complete Coston2 testnet environment', () => {
    expect(loadExecutorConfig(validEnvironment).batchSize).toBe(10);
  });

  it('reports only the names of missing or malformed schema variables', () => {
    const environment = {
      ...validEnvironment,
      EXECUTOR_PRIVATE_KEY: 'missing-prefix',
      XRPL_WS_URL: 'not-a-url',
      COSTON2_CHAIN_ID: 'flare-mainnet',
    };

    expect(() => loadExecutorConfig(environment)).toThrowError(
      expect.objectContaining<Partial<ExecutorConfigurationError>>({
        code: 'INVALID_EXECUTOR_CONFIG',
        invalidEnvironmentVariables: ['COSTON2_CHAIN_ID', 'EXECUTOR_PRIVATE_KEY', 'XRPL_WS_URL'],
      }),
    );
  });

  it.each([
    ['DATA_ENCRYPTION_KEY_V1', 'not-base64'],
    ['FLARE_CONTRACT_REGISTRY', 'not-an-address'],
    ['PAYMORPH_ROUTER_ADDRESS', 'not-an-address'],
  ] as const)('reports conversion failure for %s without its value', (name, value) => {
    expect(() => loadExecutorConfig({ ...validEnvironment, [name]: value })).toThrowError(
      expect.objectContaining<Partial<ExecutorConfigurationError>>({
        code: 'INVALID_EXECUTOR_CONFIG',
        invalidEnvironmentVariables: [name],
      }),
    );
  });
});
