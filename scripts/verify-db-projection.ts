import { randomBytes, randomUUID } from 'node:crypto';
import {
  AttemptStatus,
  Denomination,
  InvoiceStatus,
  SettlementAsset,
  db,
  transitionAttempt,
} from '../packages/db/src/index.js';
import { buildPublicReceipt } from '../apps/web/src/lib/server/receipts/service.js';

if (process.env.RUN_DB_PROJECTION_ACCEPTANCE !== '1') {
  throw new Error(
    'Refusing database acceptance fixture. Set RUN_DB_PROJECTION_ACCEPTANCE=1 explicitly.',
  );
}
if (process.env.APP_ENV !== 'development') {
  throw new Error(
    'Database projection acceptance fixtures are permitted only when APP_ENV=development.',
  );
}

const runId = randomUUID();
const fixture = {
  merchantId: randomUUID(),
  invoiceId: randomUUID(),
  payerSessionId: randomUUID(),
  quoteId: randomUUID(),
  attemptId: randomUUID(),
  merchantAddress: randomAddress(),
  recipientAddress: randomAddress(),
  personalAccount: randomAddress(),
  paymentId: randomHash(),
  flareTransactionHash: randomHash(),
};
let verified: string[] | null = null;

try {
  await db.$transaction(async (transaction) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1_000);
    await transaction.merchant.create({
      data: {
        id: fixture.merchantId,
        walletAddress: fixture.merchantAddress,
        displayName: 'PayMorph local database acceptance fixture',
        defaultAsset: SettlementAsset.FXRP,
      },
    });
    await transaction.invoice.create({
      data: {
        id: fixture.invoiceId,
        merchantId: fixture.merchantId,
        publicSlug: `db-projection-${runId}`,
        title: 'Local projection fixture',
        description: 'Temporary development-only receipt-projection fixture.',
        externalRef: `db-projection:${runId}`,
        denomination: Denomination.XRP,
        amountBaseUnits: '1000000',
        settlementAsset: SettlementAsset.FXRP,
        status: InvoiceStatus.ACTIVE,
        expiresAt,
        publishedAt: now,
        recipients: {
          create: {
            position: 0,
            label: 'Fixture recipient',
            address: fixture.recipientAddress,
            bps: 10_000,
          },
        },
      },
    });
    await transaction.payerSession.create({
      data: {
        id: fixture.payerSessionId,
        invoiceId: fixture.invoiceId,
        network: 'XRPL_TESTNET',
        sessionTokenHash: randomBytes(32).toString('hex'),
        xrplAccount: 'rDBProjectionFixtureAccount',
        expiresAt,
      },
    });
    await transaction.quote.create({
      data: {
        id: fixture.quoteId,
        invoiceId: fixture.invoiceId,
        payerXrplAccount: 'rDBProjectionFixtureAccount',
        personalAccount: fixture.personalAccount,
        personalAccountNonce: '0',
        invoiceOutBaseUnits: '1000000',
        serviceFeeOutBaseUnits: '5000',
        serviceFeeBps: 50,
        maxFxrpInputUBA: '1010000',
        protocolMintFeeUBA: '10000',
        executorFeeUBA: '10000',
        directMintFeeBips: '25',
        directMintMinimumFeeUBA: '10000',
        xrplPaymentDrops: '2000000',
        slippageBps: 0,
        route: 'FXRP',
        userOpHash: randomHash(),
        userOpDataEnc: 'development-only-projection-fixture',
        memoHex: `FE${'00'.repeat(41)}`,
        directMintAddress: randomAddress(),
        assetManagerAddress: randomAddress(),
        fxrpAddress: randomAddress(),
        expiresAt,
        settlementDeadline: expiresAt,
      },
    });
    await transaction.paymentAttempt.create({
      data: {
        id: fixture.attemptId,
        paymentId: fixture.paymentId,
        invoiceId: fixture.invoiceId,
        payerSessionId: fixture.payerSessionId,
        quoteId: fixture.quoteId,
        status: AttemptStatus.FLARE_CONFIRMED,
        payerXrplAccount: 'rDBProjectionFixtureAccount',
        personalAccount: fixture.personalAccount,
        xrplTxHash: randomHash().slice(2).toUpperCase(),
      },
    });
    await transaction.chainEvent.create({
      data: {
        attemptId: fixture.attemptId,
        chain: 'EVM',
        chainId: '114',
        txHash: fixture.flareTransactionHash,
        logIndex: 0,
        blockNumber: 1n,
        eventName: 'RecipientPaid',
        payloadJson: {
          paymentId: fixture.paymentId,
          recipient: fixture.recipientAddress,
          token: fixture.personalAccount,
          amount: '1000000',
          bps: 10_000,
        },
      },
    });
  });

  await transitionAttempt({
    attemptId: fixture.attemptId,
    expectedStatus: AttemptStatus.FLARE_CONFIRMED,
    nextStatus: AttemptStatus.SETTLED,
    settlementEvidence: {
      chainId: '114',
      txHash: fixture.flareTransactionHash,
      logIndex: 1,
      blockNumber: 1n,
      payload: {
        paymentId: fixture.paymentId,
        payerPersonalAccount: fixture.personalAccount,
        asset: 'FXRP',
        invoiceAmount: '1000000',
        serviceFee: '5000',
        inputFxrpUsed: '1010000',
        refundTo: fixture.personalAccount,
        refundFxrp: '0',
        routerAddress: randomAddress(),
        routerVersion: 'db-acceptance-fixture',
        assetManagerAddress: randomAddress(),
      },
    },
  });

  const [receipt, attempt, deliveryCount] = await Promise.all([
    buildPublicReceipt(fixture.attemptId),
    db.paymentAttempt.findUniqueOrThrow({
      where: { id: fixture.attemptId },
      select: { status: true, flareTxHash: true, settledAt: true },
    }),
    db.merchantWebhookDelivery.count({
      where: { merchantId: fixture.merchantId, eventType: 'payment.settled' },
    }),
  ]);
  if (
    attempt.status !== AttemptStatus.SETTLED ||
    attempt.flareTxHash !== fixture.flareTransactionHash ||
    attempt.settledAt === null ||
    receipt.status !== 'SETTLED' ||
    receipt.paymentId !== fixture.paymentId ||
    receipt.settlement.flareTxHash !== fixture.flareTransactionHash ||
    receipt.recipients.length !== 1 ||
    receipt.recipients[0]?.address.toLowerCase() !== fixture.recipientAddress.toLowerCase() ||
    deliveryCount !== 1
  ) {
    throw new Error('Receipt projection fixture failed to retain complete settlement evidence.');
  }

  verified = [
    'PaymentSettled-gated SETTLED transition',
    'receipt reconstruction',
    'RecipientPaid projection',
    'payment.settled webhook outbox enqueue',
  ];
} finally {
  await db.$transaction(async (transaction) => {
    await transaction.merchantWebhookDelivery.deleteMany({
      where: { merchantId: fixture.merchantId },
    });
    await transaction.chainEvent.deleteMany({ where: { attemptId: fixture.attemptId } });
    await transaction.paymentAttempt.deleteMany({ where: { id: fixture.attemptId } });
    await transaction.quote.deleteMany({ where: { id: fixture.quoteId } });
    await transaction.payerSession.deleteMany({ where: { id: fixture.payerSessionId } });
    await transaction.invoiceRecipient.deleteMany({ where: { invoiceId: fixture.invoiceId } });
    await transaction.invoice.deleteMany({ where: { id: fixture.invoiceId } });
    await transaction.merchant.deleteMany({ where: { id: fixture.merchantId } });
    const leftoverCounts = await Promise.all([
      transaction.merchantWebhookDelivery.count({ where: { merchantId: fixture.merchantId } }),
      transaction.chainEvent.count({ where: { attemptId: fixture.attemptId } }),
      transaction.paymentAttempt.count({ where: { id: fixture.attemptId } }),
      transaction.quote.count({ where: { id: fixture.quoteId } }),
      transaction.payerSession.count({ where: { id: fixture.payerSessionId } }),
      transaction.invoiceRecipient.count({ where: { invoiceId: fixture.invoiceId } }),
      transaction.invoice.count({ where: { id: fixture.invoiceId } }),
      transaction.merchant.count({ where: { id: fixture.merchantId } }),
    ]);
    if (leftoverCounts.some((count) => count !== 0)) {
      throw new Error('Database acceptance fixture cleanup left durable records behind.');
    }
  });
  await db.$disconnect();
}

if (verified === null) {
  throw new Error('Database projection fixture did not finish verification.');
}
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    runId,
    verified,
    warning: 'Development-only database fixture; no XRPL, FDC, or Coston2 transaction was sent.',
  })}\n`,
);

function randomAddress(): `0x${string}` {
  return `0x${randomBytes(20).toString('hex')}`;
}

function randomHash(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}`;
}
