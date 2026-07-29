import { getAddress, type Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import {
  FLARE_CONTRACT_REGISTRY_ADDRESS,
  FlareNetworkProvider,
  type FlareProviderConfig,
  type FlareReadClient,
} from '../src/providers/flare/index.js';

const ASSET_MANAGER = getAddress('0x1000000000000000000000000000000000000001');
const MASTER_ACCOUNT_CONTROLLER = getAddress('0x1000000000000000000000000000000000000002');
const FTSO_V2 = getAddress('0x1000000000000000000000000000000000000003');
const FXRP = getAddress('0x1000000000000000000000000000000000000004');
const USDT0 = getAddress('0x1000000000000000000000000000000000000005');
const ROUTER = getAddress('0x1000000000000000000000000000000000000006');
const FACTORY = getAddress('0x1000000000000000000000000000000000000007');
const QUOTER = getAddress('0x1000000000000000000000000000000000000008');
const POOL = getAddress('0x1000000000000000000000000000000000000009');
const PERSONAL_ACCOUNT = getAddress('0x1000000000000000000000000000000000000010');

interface MockOptions {
  readonly chainId?: number;
  readonly routerHasCode?: boolean;
  readonly completeRoute?: boolean;
  readonly feedDecimals?: number;
}

function createMockProvider(options: MockOptions = {}): {
  readonly provider: FlareNetworkProvider;
  readonly client: FlareReadClient;
} {
  const completeRoute = options.completeRoute ?? false;
  const codeAddresses = new Set(
    [
      FLARE_CONTRACT_REGISTRY_ADDRESS,
      ASSET_MANAGER,
      MASTER_ACCOUNT_CONTROLLER,
      FTSO_V2,
      FXRP,
      USDT0,
      ...(options.routerHasCode === true || completeRoute ? [ROUTER] : []),
      ...(completeRoute ? [FACTORY, QUOTER, POOL] : []),
    ].map((address) => address.toLowerCase()),
  );

  const readContract = vi.fn(async (request: ReadContractRequest): Promise<unknown> => {
    await Promise.resolve();
    switch (request.functionName) {
      case 'getContractAddressByName': {
        const name = request.args?.[0];
        if (name === 'AssetManagerFXRP') return ASSET_MANAGER;
        if (name === 'MasterAccountController') return MASTER_ACCOUNT_CONTROLLER;
        if (name === 'FtsoV2') return FTSO_V2;
        throw new Error(`Unexpected registry key ${String(name)}`);
      }
      case 'fAsset':
        return FXRP;
      case 'directMintingPaymentAddress':
        return 'rDirectMintingVault';
      case 'getDirectMintingFeeBIPS':
        return 25n;
      case 'getDirectMintingMinimumFeeUBA':
        return 100_000n;
      case 'getDirectMintingExecutorFeeUBA':
        return 100_000n;
      case 'name':
        return isSameAddress(request.address, FXRP) ? 'FAsset XRP' : 'USDT0 test';
      case 'symbol':
        return isSameAddress(request.address, FXRP) ? 'FTestXRP' : 'USD₮0';
      case 'decimals':
        return 6;
      case 'getPersonalAccount':
        return PERSONAL_ACCOUNT;
      case 'getNonce':
        return 7n;
      case 'factory':
        return FACTORY;
      case 'getPool':
        return POOL;
      case 'liquidity':
        return 5_000_000n;
      default:
        throw new Error(`Unexpected read ${request.functionName}`);
    }
  });

  const client = {
    getChainId: vi.fn(() => Promise.resolve(options.chainId ?? 114)),
    getBytecode: vi.fn(({ address }: { address: Address }) =>
      Promise.resolve(codeAddresses.has(address.toLowerCase()) ? '0x6000' : undefined),
    ),
    getBlock: vi.fn(() =>
      Promise.resolve({
        number: 123n,
        timestamp: 1_000n,
      }),
    ),
    readContract,
    simulateContract: vi.fn(() =>
      Promise.resolve({
        result: [1_100_000n, options.feedDecimals ?? 6, 970n] as const,
      }),
    ),
  } as unknown as FlareReadClient;

  const config: FlareProviderConfig = {
    usdt0Address: USDT0,
    sparkDexRouterAddress: ROUTER,
    ...(completeRoute
      ? {
          sparkDexFactoryAddress: FACTORY,
          sparkDexQuoterAddress: QUOTER,
          sparkDexPoolFee: 500,
        }
      : {}),
  };
  return {
    provider: new FlareNetworkProvider(client, config),
    client,
  };
}

describe('FlareNetworkProvider', () => {
  it('resolves current protocol contracts and reports a missing documented router honestly', async () => {
    const { provider } = createMockProvider();

    const network = await provider.resolveNetwork(60);

    expect(network.contracts).toEqual({
      registry: FLARE_CONTRACT_REGISTRY_ADDRESS,
      assetManagerFXRP: ASSET_MANAGER,
      masterAccountController: MASTER_ACCOUNT_CONTROLLER,
      ftsoV2: FTSO_V2,
    });
    expect(network.fxrp).toMatchObject({
      address: FXRP,
      symbol: 'FTestXRP',
      decimals: 6,
    });
    expect(network.directMintingPaymentAddress).toBe('rDirectMintingVault');
    expect(network.directMintSettings).toEqual({
      feeBIPS: 25n,
      minimumFeeUBA: 100_000n,
      executorFeeUBA: 100_000n,
    });
    expect(network.xrpUsd).toMatchObject({
      value: 1_100_000n,
      decimals: 6,
      exactValue: {
        numerator: 1_100_000n,
        denominator: 1_000_000n,
      },
      ageSeconds: 30n,
      fresh: true,
    });
    expect(network.capabilities.USDT0).toEqual({
      available: false,
      reason: 'SWAP_ROUTER_NO_CODE',
      token: USDT0,
      router: ROUTER,
    });
  });

  it('reads the deterministic personal account and nonce from the MAC', async () => {
    const { provider } = createMockProvider();
    const contracts = await provider.resolveContracts();

    await expect(provider.readPersonalAccount('rPayer', contracts)).resolves.toEqual({
      xrplAccount: 'rPayer',
      personalAccount: PERSONAL_ACCOUNT,
      nonce: 7n,
      deployed: false,
    });
  });

  it('preserves and scales a negative signed FTSO decimal exponent', async () => {
    const { provider } = createMockProvider({ feedDecimals: -2 });
    const contracts = await provider.resolveContracts();

    await expect(provider.readXrpUsdFeed(60, contracts)).resolves.toMatchObject({
      value: 1_100_000n,
      decimals: -2,
      exactValue: {
        numerator: 110_000_000n,
        denominator: 1n,
      },
    });
  });

  it('only enables USDT0 after router, factory, quoter, pool, and liquidity checks pass', async () => {
    const { provider } = createMockProvider({ completeRoute: true });
    const fassets = await provider.readFAssetsState();

    await expect(provider.readSettlementCapabilities(fassets)).resolves.toEqual({
      FXRP: {
        available: true,
        token: FXRP,
      },
      USDT0: {
        available: true,
        token: USDT0,
        router: ROUTER,
        factory: FACTORY,
        quoter: QUOTER,
        pool: POOL,
        poolFee: 500,
        liquidity: 5_000_000n,
      },
    });
  });

  it('rejects a provider connected to the wrong chain', async () => {
    const { provider } = createMockProvider({ chainId: 14 });

    await expect(provider.resolveContracts()).rejects.toMatchObject({
      code: 'CHAIN_ID_MISMATCH',
    });
  });
});

interface ReadContractRequest {
  readonly address: Address;
  readonly functionName: string;
  readonly args?: readonly unknown[];
}

function isSameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
