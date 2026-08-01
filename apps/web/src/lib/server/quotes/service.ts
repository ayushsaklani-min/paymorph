import { randomUUID } from 'node:crypto';
import { db, AttemptStatus, InvoiceStatus } from '@paymorph/db';
import {
  buildFxrpSettlementCalls,
  buildUsdt0SettlementCalls,
  calculateQuote,
  calculateSettlementOutput,
  ceilBps,
  createPaymentId,
  DomainError,
  encodeSmartAccountOperation,
  encryptSensitive,
  formatBaseUnits,
  type VerifiedUsdt0Capability,
} from '@paymorph/shared';
import { getAddress, isAddress, isAddressEqual, zeroAddress, type Address } from 'viem';
import { getPayerRuntimeConfig } from '../payer-session/config.js';
import { hashPayerSessionToken } from '../payer-session/cookie.js';
import { assertConfiguredFdcVerifierReady } from '../fdc/verifier-readiness.js';
import { getConfiguredFlareProvider, resolveConfiguredNetwork } from '../network.js';

const routerReadAbi = [
  {
    type: 'function',
    name: 'serviceFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'FXRP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'USDT0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'adapter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const adapterReadAbi = [
  {
    type: 'function',
    name: 'payMorphRouter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'swapRouter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenIn',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenOut',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'supportedPoolFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint24' }],
  },
] as const;

const ACTIVE_ATTEMPT_STATUSES: AttemptStatus[] = [
  'QUOTED',
  'XAMAN_CREATED',
  'AWAITING_SIGNATURE',
  'XRPL_SIGNED',
  'XRPL_VALIDATED',
  'USEROP_UPLOADED',
  'FDC_REQUESTED',
  'FDC_READY',
  'FLARE_SUBMITTED',
  'FLARE_CONFIRMED',
  'RECOVERY_REQUIRED',
];

const RESUMABLE_ATTEMPT_STATUSES: AttemptStatus[] = [
  AttemptStatus.QUOTED,
  AttemptStatus.XAMAN_CREATED,
  AttemptStatus.AWAITING_SIGNATURE,
];

export async function createQuote(input: {
  invoiceSlug: string;
  payerSessionToken: string;
  slippageBps: number;
}) {
  const now = new Date();
  const payerSession = await db.payerSession.findUnique({
    where: { sessionTokenHash: hashPayerSessionToken(input.payerSessionToken) },
    include: {
      invoice: {
        include: { recipients: { orderBy: { position: 'asc' } } },
      },
    },
  });
  if (
    !payerSession ||
    payerSession.expiresAt <= now ||
    !payerSession.xrplAccount ||
    payerSession.invoice.publicSlug !== input.invoiceSlug
  ) {
    throw new DomainError('PAYER_NOT_IDENTIFIED', 'Complete Xaman SignIn before quoting');
  }
  const invoice = payerSession.invoice;
  if (invoice.status !== InvoiceStatus.ACTIVE || invoice.expiresAt <= now) {
    throw new DomainError('INVOICE_NOT_ACTIVE', 'Invoice is not active');
  }

  await assertConfiguredFdcVerifierReady().catch(() => {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      'Flare Data Connector verifier is not ready. Do not send an XRP payment yet.',
    );
  });

  // A quote commits immutable payment bytes, so it performs a fresh route
  // preflight rather than accepting the short readiness-cache window.
  const network = await resolveConfiguredNetwork({ forceRefresh: true });
  if (!network.xrpUsd.fresh) {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'XRP/USD price feed is stale');
  }
  const usdt0Capability =
    invoice.settlementAsset === 'USDT0'
      ? requireUsdt0Capability(network.capabilities.USDT0)
      : undefined;

  const routerAddress = configuredRouterAddress();
  const provider = getConfiguredFlareProvider();
  const routerCode = await provider.client.getBytecode({ address: routerAddress });
  if (!routerCode || routerCode === '0x') {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'Configured PayMorphRouter has no bytecode');
  }
  const [serviceFeeBps, paused, routerFxrp, routerUsdt0, routerAdapter, personalAccountState] =
    await Promise.all([
      provider.client.readContract({
        address: routerAddress,
        abi: routerReadAbi,
        functionName: 'serviceFeeBps',
      }),
      provider.client.readContract({
        address: routerAddress,
        abi: routerReadAbi,
        functionName: 'paused',
      }),
      provider.client.readContract({
        address: routerAddress,
        abi: routerReadAbi,
        functionName: 'FXRP',
      }),
      provider.client.readContract({
        address: routerAddress,
        abi: routerReadAbi,
        functionName: 'USDT0',
      }),
      provider.client.readContract({
        address: routerAddress,
        abi: routerReadAbi,
        functionName: 'adapter',
      }),
      provider.readPersonalAccount(payerSession.xrplAccount, network.contracts),
    ]);
  if (paused) throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'Settlement contract is paused');

  if (!isAddressEqual(routerFxrp, network.fxrp.address)) {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      'Configured PayMorphRouter FXRP token does not match',
    );
  }

  if (usdt0Capability) {
    await assertUsdt0RouterRoute({
      provider,
      routerAddress,
      routerFxrp,
      routerUsdt0,
      routerAdapter,
      fxrpAddress: network.fxrp.address,
      capability: usdt0Capability,
    });
  }

  const exactOutputFxrpQuoteUBA =
    usdt0Capability === undefined
      ? undefined
      : await quoteUsdt0ExactOutput({
          provider,
          capability: usdt0Capability,
          fxrpAddress: network.fxrp.address,
          denomination: invoice.denomination,
          invoiceBaseUnits: BigInt(invoice.amountBaseUnits.toFixed(0)),
          serviceFeeBps,
          xrpUsdValue: network.xrpUsd.value,
          xrpUsdDecimals: network.xrpUsd.decimals,
        });

  const calculation = calculateQuote({
    denomination: invoice.denomination,
    settlementAsset: invoice.settlementAsset,
    invoiceBaseUnits: BigInt(invoice.amountBaseUnits.toFixed(0)),
    serviceFeeBps,
    slippageBps: input.slippageBps,
    xrpUsdValue: network.xrpUsd.value,
    xrpUsdDecimals: network.xrpUsd.decimals,
    directMintSettings: network.directMintSettings,
    ...(exactOutputFxrpQuoteUBA === undefined ? {} : { exactOutputFxrpQuoteUBA }),
  });

  const maxTtlSeconds = parseInteger(
    process.env.MAX_QUOTE_TTL_SECONDS ?? '900',
    'MAX_QUOTE_TTL_SECONDS',
  );
  const expiresAt = new Date(
    Math.min(now.getTime() + maxTtlSeconds * 1_000, invoice.expiresAt.getTime()),
  );
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1_000) {
    throw new DomainError('QUOTE_EXPIRED', 'Invoice expires too soon for a safe payment quote');
  }
  // The payer must sign by expiresAt. FDC finalization gets a bounded grace
  // window because Xaman expiry does not prevent a post-open signature.
  const settlementDeadline = new Date(expiresAt.getTime() + 15 * 60 * 1_000);
  const quoteId = randomUUID();
  const attemptId = randomUUID();
  const paymentId = createPaymentId({
    chainDomain: 'PAYMORPH:XRPL_TESTNET:COSTON2:V1',
    invoiceId: invoice.id,
    quoteId,
    payerXrplAccount: payerSession.xrplAccount,
  });
  const recipients = invoice.recipients.map((recipient) => ({
    account: getAddress(recipient.address),
    bps: recipient.bps,
  }));
  const calls =
    usdt0Capability === undefined
      ? buildFxrpSettlementCalls({
          fxrpAddress: network.fxrp.address,
          routerAddress,
          paymentId,
          invoiceFxrpAmount: calculation.invoiceOutBaseUnits,
          recipients,
          feeBps: serviceFeeBps,
          deadline: BigInt(Math.floor(settlementDeadline.getTime() / 1_000)),
          personalAccount: personalAccountState.personalAccount,
        })
      : buildUsdt0SettlementCalls({
          fxrpAddress: network.fxrp.address,
          routerAddress,
          paymentId,
          maxFxrpInput: calculation.maxFxrpInputUBA,
          invoiceUsdt0Out: calculation.invoiceOutBaseUnits,
          recipients,
          feeBps: serviceFeeBps,
          poolFee: usdt0Capability.poolFee,
          deadline: BigInt(Math.floor(settlementDeadline.getTime() / 1_000)),
          personalAccount: personalAccountState.personalAccount,
        });
  const operation = encodeSmartAccountOperation({
    calls,
    sender: personalAccountState.personalAccount,
    nonce: personalAccountState.nonce,
    walletId: 0,
    executorFeeUBA: network.directMintSettings.executorFeeUBA,
  });
  if (operation.totalCallValue !== 0n) {
    throw new DomainError('INTERNAL_ERROR', 'PayMorph v1 user operation has native call value');
  }
  const encryptionKey = getPayerRuntimeConfig().encryptionKey;
  const userOpDataEnc = encryptSensitive(Buffer.from(operation.packedUserOpData.slice(2), 'hex'), {
    key: encryptionKey,
    aad: `quote:${quoteId}`,
  });

  const transactionResult = await db.$transaction(async (transaction) => {
    await transaction.paymentAttempt.updateMany({
      where: {
        invoiceId: invoice.id,
        status: AttemptStatus.QUOTED,
        quote: { expiresAt: { lte: now } },
      },
      data: { status: AttemptStatus.QUOTE_EXPIRED },
    });
    const existing = await transaction.paymentAttempt.findFirst({
      where: {
        invoiceId: invoice.id,
        status: { in: [...ACTIVE_ATTEMPT_STATUSES, AttemptStatus.SETTLED] },
      },
      select: {
        id: true,
        status: true,
        payerSessionId: true,
        quote: {
          select: {
            id: true,
            payerXrplAccount: true,
            invoiceOutBaseUnits: true,
            serviceFeeOutBaseUnits: true,
            serviceFeeBps: true,
            xrplPaymentDrops: true,
            maxFxrpInputUBA: true,
            route: true,
            personalAccount: true,
            userOpHash: true,
            expiresAt: true,
            settlementDeadline: true,
          },
        },
      },
    });
    if (existing) {
      if (
        existing.payerSessionId === payerSession.id &&
        existing.quote.payerXrplAccount === payerSession.xrplAccount &&
        existing.quote.expiresAt > now &&
        RESUMABLE_ATTEMPT_STATUSES.includes(existing.status)
      ) {
        return { kind: 'RESUME' as const, attempt: existing };
      }
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        existing.status === AttemptStatus.SETTLED
          ? 'Invoice is already settled'
          : 'Invoice already has an active payment attempt',
      );
    }

    await transaction.quote.create({
      data: {
        id: quoteId,
        invoiceId: invoice.id,
        payerXrplAccount: payerSession.xrplAccount!,
        personalAccount: personalAccountState.personalAccount,
        personalAccountNonce: personalAccountState.nonce.toString(),
        xrpUsdValue: network.xrpUsd.value.toString(),
        xrpUsdDecimals: network.xrpUsd.decimals,
        xrpUsdTimestamp: new Date(Number(network.xrpUsd.timestamp) * 1_000),
        ftsoFeedId: network.xrpUsd.feedId,
        invoiceOutBaseUnits: calculation.invoiceOutBaseUnits.toString(),
        serviceFeeOutBaseUnits: calculation.serviceFeeOutBaseUnits.toString(),
        serviceFeeBps,
        maxFxrpInputUBA: calculation.maxFxrpInputUBA.toString(),
        protocolMintFeeUBA: calculation.protocolMintFeeUBA.toString(),
        executorFeeUBA: calculation.executorFeeUBA.toString(),
        directMintFeeBips: network.directMintSettings.feeBIPS.toString(),
        directMintMinimumFeeUBA: network.directMintSettings.minimumFeeUBA.toString(),
        xrplPaymentDrops: calculation.xrplPaymentDrops.toString(),
        slippageBps: input.slippageBps,
        route: calculation.route,
        ...(usdt0Capability === undefined
          ? {}
          : {
              poolFee: usdt0Capability.poolFee,
              quotedFxrpInputUBA: exactOutputFxrpQuoteUBA!.toString(),
              swapRouterAddress: usdt0Capability.router,
              swapQuoterAddress: usdt0Capability.quoter,
              swapPoolAddress: usdt0Capability.pool,
            }),
        userOpHash: operation.userOpHash,
        userOpDataEnc,
        memoHex: operation.memoHex,
        directMintAddress: network.directMintingPaymentAddress,
        assetManagerAddress: network.contracts.assetManagerFXRP,
        fxrpAddress: network.fxrp.address,
        expiresAt,
        settlementDeadline,
      },
    });
    await transaction.paymentAttempt.create({
      data: {
        id: attemptId,
        paymentId,
        invoiceId: invoice.id,
        payerSessionId: payerSession.id,
        quoteId,
        status: AttemptStatus.QUOTED,
        payerXrplAccount: payerSession.xrplAccount!,
        personalAccount: personalAccountState.personalAccount,
      },
    });
    return { kind: 'CREATED' as const };
  });

  if (transactionResult.kind === 'RESUME') {
    return publicStoredQuote(transactionResult.attempt);
  }

  return publicCalculatedQuote({
    quoteId,
    attemptId,
    calculation,
    settlementAsset: invoice.settlementAsset,
    serviceFeeBps,
    personalAccount: personalAccountState.personalAccount,
    userOpHash: operation.userOpHash,
    expiresAt,
    settlementDeadline,
  });
}

function publicCalculatedQuote(input: {
  quoteId: string;
  attemptId: string;
  calculation: ReturnType<typeof calculateQuote>;
  settlementAsset: 'FXRP' | 'USDT0';
  serviceFeeBps: number;
  personalAccount: string;
  userOpHash: string;
  expiresAt: Date;
  settlementDeadline: Date;
}) {
  return {
    quoteId: input.quoteId,
    attemptId: input.attemptId,
    invoiceAmount: {
      asset: input.settlementAsset,
      baseUnits: input.calculation.invoiceOutBaseUnits.toString(),
      display: formatBaseUnits(input.calculation.invoiceOutBaseUnits, 6),
    },
    serviceFee: {
      asset: input.settlementAsset,
      baseUnits: input.calculation.serviceFeeOutBaseUnits.toString(),
      display: formatBaseUnits(input.calculation.serviceFeeOutBaseUnits, 6),
      bps: input.serviceFeeBps,
    },
    customerPays: {
      asset: 'XRP',
      drops: input.calculation.xrplPaymentDrops.toString(),
      display: formatBaseUnits(input.calculation.xrplPaymentDrops, 6),
    },
    maxFxrpInputUBA: input.calculation.maxFxrpInputUBA.toString(),
    route: input.calculation.route,
    personalAccount: input.personalAccount,
    userOpHash: input.userOpHash,
    expiresAt: input.expiresAt.toISOString(),
    settlementDeadline: input.settlementDeadline.toISOString(),
    warnings: ['XRPL Testnet and Coston2 test tokens have no real monetary value.'],
  };
}

function publicStoredQuote(input: {
  id: string;
  quote: {
    id: string;
    invoiceOutBaseUnits: { toFixed(): string };
    serviceFeeOutBaseUnits: { toFixed(): string };
    serviceFeeBps: number;
    xrplPaymentDrops: { toFixed(): string };
    maxFxrpInputUBA: { toFixed(): string };
    route: string;
    personalAccount: string;
    userOpHash: string;
    expiresAt: Date;
    settlementDeadline: Date;
  };
}) {
  const invoiceOutBaseUnits = BigInt(input.quote.invoiceOutBaseUnits.toFixed());
  const serviceFeeOutBaseUnits = BigInt(input.quote.serviceFeeOutBaseUnits.toFixed());
  const xrplPaymentDrops = BigInt(input.quote.xrplPaymentDrops.toFixed());

  return {
    quoteId: input.quote.id,
    attemptId: input.id,
    invoiceAmount: {
      asset: settlementAssetForRoute(input.quote.route),
      baseUnits: invoiceOutBaseUnits.toString(),
      display: formatBaseUnits(invoiceOutBaseUnits, 6),
    },
    serviceFee: {
      asset: settlementAssetForRoute(input.quote.route),
      baseUnits: serviceFeeOutBaseUnits.toString(),
      display: formatBaseUnits(serviceFeeOutBaseUnits, 6),
      bps: input.quote.serviceFeeBps,
    },
    customerPays: {
      asset: 'XRP',
      drops: xrplPaymentDrops.toString(),
      display: formatBaseUnits(xrplPaymentDrops, 6),
    },
    maxFxrpInputUBA: input.quote.maxFxrpInputUBA.toFixed(),
    route: input.quote.route,
    personalAccount: input.quote.personalAccount,
    userOpHash: input.quote.userOpHash,
    expiresAt: input.quote.expiresAt.toISOString(),
    settlementDeadline: input.quote.settlementDeadline.toISOString(),
    warnings: ['XRPL Testnet and Coston2 test tokens have no real monetary value.'],
  };
}

function configuredRouterAddress(): Address {
  const value = process.env.PAYMORPH_ROUTER_ADDRESS;
  if (!value || !isAddress(value)) {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'PAYMORPH_ROUTER_ADDRESS is not configured');
  }
  return getAddress(value);
}

function requireUsdt0Capability(
  capability: { available: false; reason: string } | VerifiedUsdt0Capability,
): VerifiedUsdt0Capability {
  if (!capability.available) {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      `USDT0 settlement is unavailable: ${capability.reason}`,
    );
  }
  return capability;
}

async function assertUsdt0RouterRoute(input: {
  provider: ReturnType<typeof getConfiguredFlareProvider>;
  routerAddress: Address;
  routerFxrp: Address;
  routerUsdt0: Address;
  routerAdapter: Address;
  fxrpAddress: Address;
  capability: VerifiedUsdt0Capability;
}): Promise<void> {
  if (!isAddressEqual(input.routerFxrp, input.fxrpAddress)) {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      'Configured PayMorphRouter FXRP token does not match',
    );
  }
  if (!isAddressEqual(input.routerUsdt0, input.capability.token)) {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      'Configured PayMorphRouter USDT0 token does not match',
    );
  }
  if (isAddressEqual(input.routerAdapter, zeroAddress)) {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'USDT0 settlement adapter is not configured');
  }
  const adapterCode = await input.provider.client.getBytecode({ address: input.routerAdapter });
  if (!adapterCode || adapterCode === '0x') {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      'Configured USDT0 settlement adapter has no bytecode',
    );
  }

  const [payMorphRouter, swapRouter, tokenIn, tokenOut, supportedPoolFee] = await Promise.all([
    input.provider.client.readContract({
      address: input.routerAdapter,
      abi: adapterReadAbi,
      functionName: 'payMorphRouter',
    }),
    input.provider.client.readContract({
      address: input.routerAdapter,
      abi: adapterReadAbi,
      functionName: 'swapRouter',
    }),
    input.provider.client.readContract({
      address: input.routerAdapter,
      abi: adapterReadAbi,
      functionName: 'tokenIn',
    }),
    input.provider.client.readContract({
      address: input.routerAdapter,
      abi: adapterReadAbi,
      functionName: 'tokenOut',
    }),
    input.provider.client.readContract({
      address: input.routerAdapter,
      abi: adapterReadAbi,
      functionName: 'supportedPoolFee',
    }),
  ]);

  if (
    !isAddressEqual(payMorphRouter, input.routerAddress) ||
    !isAddressEqual(swapRouter, input.capability.router) ||
    !isAddressEqual(tokenIn, input.fxrpAddress) ||
    !isAddressEqual(tokenOut, input.capability.token) ||
    supportedPoolFee !== input.capability.poolFee
  ) {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      'Configured USDT0 settlement adapter does not match the verified route',
    );
  }
}

async function quoteUsdt0ExactOutput(input: {
  provider: ReturnType<typeof getConfiguredFlareProvider>;
  capability: VerifiedUsdt0Capability;
  fxrpAddress: Address;
  denomination: 'XRP' | 'USD';
  invoiceBaseUnits: bigint;
  serviceFeeBps: number;
  xrpUsdValue: bigint;
  xrpUsdDecimals: number;
}): Promise<bigint> {
  const invoiceUsdt0Out = calculateSettlementOutput({
    denomination: input.denomination,
    settlementAsset: 'USDT0',
    invoiceBaseUnits: input.invoiceBaseUnits,
    xrpUsdValue: input.xrpUsdValue,
    xrpUsdDecimals: input.xrpUsdDecimals,
  });
  const totalUsdt0Out = invoiceUsdt0Out + ceilBps(invoiceUsdt0Out, input.serviceFeeBps);
  try {
    return await input.provider.quoteUsdt0ExactOutput({
      fxrpAddress: input.fxrpAddress,
      capability: input.capability,
      amountOut: totalUsdt0Out,
    });
  } catch {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      'USDT0 exact-output route is not responding. Do not send an XRP payment yet.',
    );
  }
}

function settlementAssetForRoute(route: string): 'FXRP' | 'USDT0' {
  if (route === 'DIRECT_FXRP') return 'FXRP';
  if (route === 'SPARKDEX_EXACT_OUT') return 'USDT0';
  throw new DomainError('INTERNAL_ERROR', 'Stored quote contains an unsupported settlement route');
}

function parseInteger(value: string, name: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new TypeError(`${name} must be a positive integer`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${name} is too large`);
  return result;
}
