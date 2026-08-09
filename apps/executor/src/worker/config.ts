import { parseEncryptionKey } from '@paymorph/shared';
import { getAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';

const schema = z.object({
  DATA_ENCRYPTION_KEY_V1: z.string().min(1),
  EXECUTOR_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  XRPL_WS_URL: z.url(),
  COSTON2_RPC_URL: z.url(),
  COSTON2_CHAIN_ID: z.coerce
    .number()
    .int()
    .refine((value) => value === 114),
  FLARE_CONTRACT_REGISTRY: z.string(),
  PAYMORPH_ROUTER_ADDRESS: z.string(),
  FDC_VERIFIER_URL: z.url(),
  FDC_DA_LAYER_URL: z.url(),
  FDC_VERIFIER_API_KEY: z.string().optional(),
  FDC_SOURCE_ID: z.string().default('testXRP'),
  FDC_RETRY_AFTER_MS: z.coerce.number().int().positive().default(10_000),
  FDC_REQUIRED_XRPL_CONFIRMATIONS: z.coerce.number().int().positive().default(3),
  EXECUTOR_WORKER_ID: z.string().min(1).default(`executor-${process.pid}`),
  EXECUTOR_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(2_000),
  EXECUTOR_LEASE_MS: z.coerce.number().int().min(5_000).default(60_000),
  EXECUTOR_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),
});

export interface ExecutorConfig {
  readonly encryptionKey: Buffer;
  readonly privateKey: Hex;
  readonly xrplWsUrl: string;
  readonly coston2RpcUrl: string;
  readonly registryAddress: Address;
  readonly routerAddress: Address;
  readonly fdcVerifierUrl: string;
  readonly fdcDaLayerUrl: string;
  readonly fdcVerifierApiKey?: string;
  readonly fdcSourceId: string;
  readonly fdcRetryAfterMs: number;
  readonly requiredXrplConfirmations: number;
  readonly workerId: string;
  readonly pollIntervalMs: number;
  readonly leaseMs: number;
  readonly batchSize: number;
}

export class ExecutorConfigurationError extends Error {
  readonly code = 'INVALID_EXECUTOR_CONFIG';

  constructor(readonly invalidEnvironmentVariables: readonly string[]) {
    super('Executor environment configuration is invalid');
    this.name = 'ExecutorConfigurationError';
  }
}

export function loadExecutorConfig(env: NodeJS.ProcessEnv = process.env): ExecutorConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new ExecutorConfigurationError(
      [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'UNKNOWN')))].sort(),
    );
  }

  const value = parsed.data;
  const encryptionKey = parseConfiguredValue('DATA_ENCRYPTION_KEY_V1', () =>
    parseEncryptionKey(value.DATA_ENCRYPTION_KEY_V1),
  );
  const registryAddress = parseConfiguredValue('FLARE_CONTRACT_REGISTRY', () =>
    getAddress(value.FLARE_CONTRACT_REGISTRY),
  );
  const routerAddress = parseConfiguredValue('PAYMORPH_ROUTER_ADDRESS', () =>
    getAddress(value.PAYMORPH_ROUTER_ADDRESS),
  );

  return {
    encryptionKey,
    privateKey: value.EXECUTOR_PRIVATE_KEY as Hex,
    xrplWsUrl: value.XRPL_WS_URL,
    coston2RpcUrl: value.COSTON2_RPC_URL,
    registryAddress,
    routerAddress,
    fdcVerifierUrl: value.FDC_VERIFIER_URL,
    fdcDaLayerUrl: value.FDC_DA_LAYER_URL,
    ...(value.FDC_VERIFIER_API_KEY === undefined
      ? {}
      : { fdcVerifierApiKey: value.FDC_VERIFIER_API_KEY }),
    fdcSourceId: value.FDC_SOURCE_ID,
    fdcRetryAfterMs: value.FDC_RETRY_AFTER_MS,
    requiredXrplConfirmations: value.FDC_REQUIRED_XRPL_CONFIRMATIONS,
    workerId: value.EXECUTOR_WORKER_ID,
    pollIntervalMs: value.EXECUTOR_POLL_INTERVAL_MS,
    leaseMs: value.EXECUTOR_LEASE_MS,
    batchSize: value.EXECUTOR_BATCH_SIZE,
  };
}

function parseConfiguredValue<T>(name: string, parse: () => T): T {
  try {
    return parse();
  } catch {
    throw new ExecutorConfigurationError([name]);
  }
}
