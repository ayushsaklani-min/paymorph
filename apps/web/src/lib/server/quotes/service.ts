import { randomUUID } from 'node:crypto';
import { db, AttemptStatus, InvoiceStatus } from '@paymorph/db';
import {
  buildFxrpSettlementCalls,
  calculateQuote,
  createPaymentId,
  DomainError,
  encodeSmartAccountOperation,
  encryptSensitive,
  formatBaseUnits,
} from '@paymorph/shared';
import { getAddress, isAddress, type Address } from 'viem';
import { getPayerRuntimeConfig } from '../payer-session/config.js';
import { hashPayerSessionToken } from '../payer-session/cookie.js';
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

export async function createFxrpQuote(input: {
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

  const network = await resolveConfiguredNetwork();
  if (!network.xrpUsd.fresh) {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'XRP/USD price feed is stale');
  }
  if (invoice.settlementAsset === 'USDT0') {
    const capability = network.capabilities.USDT0;
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      capability.available
        ? 'USDT0 exact-output quoting is not enabled for this deployment'
        : `USDT0 settlement is unavailable: ${capability.reason}`,
    );
  }

  const routerAddress = configuredRouterAddress();
  const provider = getConfiguredFlareProvider();
  const routerCode = await provider.client.getBytecode({ address: routerAddress });
  if (!routerCode || routerCode === '0x') {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'Configured PayMorphRouter has no bytecode');
  }
  const [serviceFeeBps, paused, personalAccountState] = await Promise.all([
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
    provider.readPersonalAccount(payerSession.xrplAccount, network.contracts),
  ]);
  if (paused) throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'Settlement contract is paused');

  const calculation = calculateQuote({
    denomination: invoice.denomination,
    settlementAsset: invoice.settlementAsset,
    invoiceBaseUnits: BigInt(invoice.amountBaseUnits.toFixed(0)),
    serviceFeeBps,
    slippageBps: input.slippageBps,
    xrpUsdValue: network.xrpUsd.value,
    xrpUsdDecimals: network.xrpUsd.decimals,
    directMintSettings: network.directMintSettings,
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
  const calls = buildFxrpSettlementCalls({
    fxrpAddress: network.fxrp.address,
    routerAddress,
    paymentId,
    invoiceFxrpAmount: calculation.invoiceOutBaseUnits,
    recipients,
    feeBps: serviceFeeBps,
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

  await db.$transaction(async (transaction) => {
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
      select: { id: true, status: true },
    });
    if (existing) {
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
  });

  return {
    quoteId,
    attemptId,
    invoiceAmount: {
      asset: 'FXRP',
      baseUnits: calculation.invoiceOutBaseUnits.toString(),
      display: formatBaseUnits(calculation.invoiceOutBaseUnits, 6),
    },
    serviceFee: {
      asset: 'FXRP',
      baseUnits: calculation.serviceFeeOutBaseUnits.toString(),
      display: formatBaseUnits(calculation.serviceFeeOutBaseUnits, 6),
      bps: serviceFeeBps,
    },
    customerPays: {
      asset: 'XRP',
      drops: calculation.xrplPaymentDrops.toString(),
      display: formatBaseUnits(calculation.xrplPaymentDrops, 6),
    },
    maxFxrpInputUBA: calculation.maxFxrpInputUBA.toString(),
    route: calculation.route,
    personalAccount: personalAccountState.personalAccount,
    userOpHash: operation.userOpHash,
    expiresAt: expiresAt.toISOString(),
    settlementDeadline: settlementDeadline.toISOString(),
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

function parseInteger(value: string, name: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new TypeError(`${name} must be a positive integer`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${name} is too large`);
  return result;
}
