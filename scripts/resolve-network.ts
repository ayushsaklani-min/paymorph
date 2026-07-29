import type { Address } from 'viem';
import {
  createCoston2PublicClient,
  FlareNetworkProvider,
  type FlareProviderConfig,
} from '../packages/shared/src/providers/flare/index.js';

async function main(): Promise<void> {
  const rpcUrl = process.env.COSTON2_RPC_URL;
  const maxFtsoAgeSeconds = parseNonNegativeInteger(
    process.env.MAX_FTSO_AGE_SECONDS ?? '120',
    'MAX_FTSO_AGE_SECONDS',
  );
  const config: FlareProviderConfig = {
    ...optionalAddress('registryAddress', process.env.FLARE_CONTRACT_REGISTRY),
    ...optionalAddress('usdt0Address', process.env.USDT0_ADDRESS),
    ...optionalAddress('sparkDexRouterAddress', process.env.SPARKDEX_ROUTER_ADDRESS),
    ...optionalAddress('sparkDexFactoryAddress', process.env.SPARKDEX_FACTORY_ADDRESS),
    ...optionalAddress('sparkDexQuoterAddress', process.env.SPARKDEX_QUOTER_ADDRESS),
    ...(process.env.SPARKDEX_POOL_FEE === undefined || process.env.SPARKDEX_POOL_FEE.length === 0
      ? {}
      : {
          sparkDexPoolFee: parseNonNegativeInteger(
            process.env.SPARKDEX_POOL_FEE,
            'SPARKDEX_POOL_FEE',
          ),
        }),
  };

  const provider = new FlareNetworkProvider(createCoston2PublicClient(rpcUrl), config);
  const report = await provider.resolveNetwork(maxFtsoAgeSeconds);
  process.stdout.write(
    `${JSON.stringify(
      {
        resolvedAt: new Date().toISOString(),
        rpcUrl: rpcUrl ?? 'official-default',
        ...report,
      },
      (_key, value: unknown) => (typeof value === 'bigint' ? value.toString(10) : value),
      2,
    )}\n`,
  );
}

function optionalAddress<Key extends keyof FlareProviderConfig>(
  key: Key,
  value: string | undefined,
): Partial<Record<Key, Address>> {
  return value === undefined || value.length === 0
    ? {}
    : ({ [key]: value as Address } as Partial<Record<Key, Address>>);
}

function parseNonNegativeInteger(value: string, name: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${name} must be a canonical non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`${name} exceeds the safe integer range`);
  }
  return parsed;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Coston2 network resolution failed: ${message}`);
  process.exitCode = 1;
});
