import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { payMorphRouterEventsAbi } from '../apps/executor/src/adapters/flare/abis.js';
import { validateXrplPayment } from '../apps/executor/src/adapters/xrpl/validator.js';
import { parseRecoveryXrplExpectation } from '../apps/executor/src/worker/recovery-request.js';
import { db } from '../packages/db/src/index.js';
import { createCoston2PublicClient, FlareNetworkProvider } from '../packages/shared/src/index.js';
import { getAddress, parseAbi, parseEventLogs, type Hex } from 'viem';

if (process.env.RUN_LIVE_RECOVERY !== '1') {
  throw new Error('Refusing live recovery verification. Set RUN_LIVE_RECOVERY=1 explicitly.');
}
const attemptId = process.env.LIVE_ATTEMPT_ID;
if (!attemptId) throw new Error('Set LIVE_ATTEMPT_ID to the recovered attempt UUID.');

const attempt = await db.paymentAttempt.findUnique({
  where: { id: attemptId },
  include: {
    recoveryRequests: {
      orderBy: { generation: 'desc' },
      take: 1,
      include: {
        executions: {
          where: { status: 'CONFIRMED' },
          orderBy: { executionGeneration: 'desc' },
        },
      },
    },
  },
});
if (!attempt || attempt.status !== 'RECOVERED' || !attempt.xrplTxHash) {
  throw new Error('Attempt is not evidence-backed RECOVERED');
}
const recovery = attempt.recoveryRequests[0];
if (!recovery || recovery.status !== 'XRPL_VALIDATED' || !recovery.xrplTxHash) {
  throw new Error('Latest recovery request is not XRPL_VALIDATED');
}
const recoveryExpectation = parseRecoveryXrplExpectation(recovery.requestJson);
const originalTransactionId = normalizeBytes32(attempt.xrplTxHash);
if (recoveryExpectation.targetTransactionId !== originalTransactionId) {
  throw new Error('Recovery request does not target the original XRPL transaction');
}
const marker = recovery.executions.find((execution) => execution.stage === 'MARKER');
const original = recovery.executions.find((execution) => execution.stage === 'ORIGINAL');
if (!marker?.transactionHash || !original?.transactionHash) {
  throw new Error('Confirmed marker and original Coston2 transactions are required');
}

const xrplRpc = process.env.XRPL_RPC_URL ?? 'https://s.altnet.rippletest.net:51234';
const xrplResponse = await fetch(xrplRpc, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    method: 'tx',
    params: [{ transaction: recovery.xrplTxHash, binary: false, api_version: 2 }],
  }),
});
const xrpl = (await xrplResponse.json()) as unknown;
if (!xrplResponse.ok) throw new Error(`Recovery XRPL lookup returned HTTP ${xrplResponse.status}`);
const validatedRecovery = validateXrplPayment(xrpl, {
  transactionHash: recovery.xrplTxHash,
  payerAccount: attempt.payerXrplAccount,
  destination: recoveryExpectation.destination,
  amountDrops: recoveryExpectation.amountDrops,
  memoHex: recoveryExpectation.memoHex,
  memoOpcode: 'E0',
  lastLedgerSequence: recoveryExpectation.lastLedgerSequence,
});

const client = createCoston2PublicClient(process.env.COSTON2_RPC_URL);
const configuredRouterAddress = process.env.PAYMORPH_ROUTER_ADDRESS;
if (!configuredRouterAddress) {
  throw new Error('PAYMORPH_ROUTER_ADDRESS is required for recovery settlement verification');
}
const payMorphRouterAddress = getAddress(configuredRouterAddress);
const routerCode = await client.getBytecode({ address: payMorphRouterAddress });
if (!routerCode || routerCode === '0x') {
  throw new Error(`PayMorph router has no bytecode at ${payMorphRouterAddress}`);
}
const provider = new FlareNetworkProvider(client, {
  ...(process.env.FLARE_CONTRACT_REGISTRY
    ? { registryAddress: getAddress(process.env.FLARE_CONTRACT_REGISTRY) }
    : {}),
});
const contracts = await provider.resolveContracts();
const [markerReceipt, originalReceipt] = await Promise.all([
  client.getTransactionReceipt({ hash: marker.transactionHash as Hex }),
  client.getTransactionReceipt({ hash: original.transactionHash as Hex }),
]);
if (markerReceipt.status !== 'success' || originalReceipt.status !== 'success') {
  throw new Error('A recovery Coston2 transaction reverted');
}

const macAbi = parseAbi([
  'event IgnoreMemoSet(address indexed personalAccount, bytes32 indexed targetTxId)',
  'event DirectMintingExecuted(address indexed personalAccount, bytes32 indexed transactionId, string sourceAddress, uint256 amount, uint256 executorFee, address executor)',
  'event UserOperationExecuted(address indexed personalAccount, uint256 nonce)',
]);
const markerLogs = markerReceipt.logs.filter(
  (log) => log.address.toLowerCase() === contracts.masterAccountController.toLowerCase(),
);
const originalLogs = originalReceipt.logs.filter(
  (log) => log.address.toLowerCase() === contracts.masterAccountController.toLowerCase(),
);
const ignored = parseEventLogs({
  abi: macAbi,
  eventName: 'IgnoreMemoSet',
  logs: markerLogs,
  strict: true,
});
if (
  !ignored.some(
    (event) =>
      event.args.personalAccount.toLowerCase() === attempt.personalAccount.toLowerCase() &&
      event.args.targetTxId.toLowerCase() === originalTransactionId,
  )
) {
  throw new Error('Marker receipt lacks matching IgnoreMemoSet evidence');
}
const originalMints = parseEventLogs({
  abi: macAbi,
  eventName: 'DirectMintingExecuted',
  logs: originalLogs,
  strict: true,
});
if (
  !originalMints.some(
    (event) =>
      event.args.personalAccount.toLowerCase() === attempt.personalAccount.toLowerCase() &&
      event.args.transactionId.toLowerCase() === originalTransactionId &&
      event.args.amount > 0n,
  )
) {
  throw new Error('Original receipt lacks a positive matching direct mint');
}
if (
  parseEventLogs({
    abi: macAbi,
    eventName: 'UserOperationExecuted',
    logs: originalLogs,
    strict: true,
  }).length > 0
) {
  throw new Error('Recovery original unexpectedly executed the merchant user operation');
}
const markerUserOperations = parseEventLogs({
  abi: macAbi,
  eventName: 'UserOperationExecuted',
  logs: markerLogs,
  strict: true,
});
if (markerUserOperations.length > 0) {
  throw new Error('Recovery marker unexpectedly executed a user operation');
}
const recoverySettlementEvents = [markerReceipt, originalReceipt].flatMap((receipt) =>
  parseEventLogs({
    abi: payMorphRouterEventsAbi,
    eventName: 'PaymentSettled',
    logs: receipt.logs.filter(
      (log) => log.address.toLowerCase() === payMorphRouterAddress.toLowerCase(),
    ),
    strict: true,
  }),
);
if (recoverySettlementEvents.length > 0) {
  throw new Error('Recovery marker or original unexpectedly settled a PayMorph invoice');
}

const artifact = {
  verifiedAt: new Date().toISOString(),
  attemptId,
  originalXrplTransactionHash: attempt.xrplTxHash,
  recoveryXrplTransactionHash: recovery.xrplTxHash,
  recoveryXrplLedgerIndex: validatedRecovery.ledgerIndex,
  markerFlareTransactionHash: marker.transactionHash,
  markerFlareBlockNumber: markerReceipt.blockNumber.toString(),
  originalFlareTransactionHash: original.transactionHash,
  originalFlareBlockNumber: originalReceipt.blockNumber.toString(),
  personalAccount: getAddress(attempt.personalAccount),
  warning: 'XRPL Testnet and Coston2 tokens have no real monetary value.',
};
await mkdir('live-smoke', { recursive: true });
const artifactPath = join('live-smoke', `${attemptId}-recovery.json`);
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, artifactPath, ...artifact }, null, 2));
await db.$disconnect();

function normalizeBytes32(value: string): `0x${string}` {
  const normalized = value.startsWith('0x') ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('XRPL transaction hash must be bytes32');
  }
  return normalized.toLowerCase() as `0x${string}`;
}
