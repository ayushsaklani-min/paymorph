import {
  createCoston2PublicClient,
  FlareNetworkProvider,
  type FlareProviderConfig,
  type ResolvedCoston2Network,
} from '@paymorph/shared';
import type { Address } from 'viem';

const CACHE_MS = 60_000;
let cached:
  | {
      expiresAt: number;
      value: ResolvedCoston2Network;
    }
  | undefined;

export function getConfiguredFlareProvider(): FlareNetworkProvider {
  const config = flareProviderConfig();
  return new FlareNetworkProvider(createCoston2PublicClient(process.env.COSTON2_RPC_URL), config);
}

export async function resolveConfiguredNetwork(
  options: { forceRefresh?: boolean } = {},
): Promise<ResolvedCoston2Network> {
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const provider = getConfiguredFlareProvider();
  const value = await provider.resolveNetwork(
    parseInteger(process.env.MAX_FTSO_AGE_SECONDS ?? '120', 'MAX_FTSO_AGE_SECONDS'),
  );
  cached = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

function flareProviderConfig(): FlareProviderConfig {
  const config: FlareProviderConfig = {
    ...addressOption('registryAddress', process.env.FLARE_CONTRACT_REGISTRY),
    ...addressOption('usdt0Address', process.env.USDT0_ADDRESS),
    ...addressOption('sparkDexRouterAddress', process.env.SPARKDEX_ROUTER_ADDRESS),
    ...addressOption('sparkDexFactoryAddress', process.env.SPARKDEX_FACTORY_ADDRESS),
    ...addressOption('sparkDexQuoterAddress', process.env.SPARKDEX_QUOTER_ADDRESS),
    ...(process.env.SPARKDEX_POOL_FEE
      ? { sparkDexPoolFee: parseInteger(process.env.SPARKDEX_POOL_FEE, 'SPARKDEX_POOL_FEE') }
      : {}),
  };
  return config;
}

export function serializeNetwork(value: ResolvedCoston2Network) {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint' ? item.toString(10) : item,
    ),
  ) as unknown;
}

function addressOption<Key extends keyof FlareProviderConfig>(
  key: Key,
  value: string | undefined,
): Partial<Record<Key, Address>> {
  return value ? ({ [key]: value as Address } as Partial<Record<Key, Address>>) : {};
}

function parseInteger(value: string, name: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new TypeError(`${name} must be an integer`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${name} is too large`);
  return result;
}
