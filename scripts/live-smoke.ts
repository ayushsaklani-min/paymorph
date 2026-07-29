import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCoston2PublicClient } from '../packages/shared/src/index.js';
import { getAddress, parseEventLogs, type Hex } from 'viem';

if (process.env.RUN_LIVE_TESTNET !== '1') {
  throw new Error('Refusing live verification. Set RUN_LIVE_TESTNET=1 explicitly.');
}
const attemptId = process.env.LIVE_ATTEMPT_ID;
if (!attemptId) {
  throw new Error(
    'Set LIVE_ATTEMPT_ID after completing a tiny FXRP checkout in Xaman on XRPL Testnet.',
  );
}
const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const receiptResponse = await fetch(`${appUrl}/api/receipts/${encodeURIComponent(attemptId)}`, {
  cache: 'no-store',
});
if (!receiptResponse.ok) {
  throw new Error(`Receipt endpoint returned HTTP ${receiptResponse.status}`);
}
const envelope = (await receiptResponse.json()) as {
  data?: {
    paymentId: Hex;
    status: string;
    sourcePayment: { txHash: string };
    settlement: { flareTxHash: Hex; routerAddress: string };
  };
};
const receipt = envelope.data;
if (!receipt || receipt.status !== 'SETTLED') {
  throw new Error('Receipt endpoint did not return a settled payment');
}

const xrplRpc = process.env.XRPL_RPC_URL ?? 'https://s.altnet.rippletest.net:51234';
const xrplResponse = await fetch(xrplRpc, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    method: 'tx',
    params: [{ transaction: receipt.sourcePayment.txHash, binary: false, api_version: 2 }],
  }),
});
const xrpl = (await xrplResponse.json()) as {
  result?: { validated?: boolean; meta?: { TransactionResult?: string }; ledger_index?: number };
};
if (
  !xrplResponse.ok ||
  xrpl.result?.validated !== true ||
  xrpl.result.meta?.TransactionResult !== 'tesSUCCESS'
) {
  throw new Error('XRPL transaction is not independently validated as tesSUCCESS');
}

const coston2 = createCoston2PublicClient(process.env.COSTON2_RPC_URL);
const flareReceipt = await coston2.getTransactionReceipt({ hash: receipt.settlement.flareTxHash });
if (flareReceipt.status !== 'success') {
  throw new Error('Coston2 settlement transaction reverted');
}
const paymentSettledAbi = [
  {
    type: 'event',
    name: 'PaymentSettled',
    inputs: [
      { indexed: true, name: 'paymentId', type: 'bytes32' },
      { indexed: true, name: 'payerPersonalAccount', type: 'address' },
      { indexed: false, name: 'asset', type: 'uint8' },
      { indexed: false, name: 'invoiceAmount', type: 'uint256' },
      { indexed: false, name: 'serviceFee', type: 'uint256' },
      { indexed: false, name: 'inputFxrpUsed', type: 'uint256' },
      { indexed: false, name: 'refundTo', type: 'address' },
      { indexed: false, name: 'refundFxrp', type: 'uint256' },
    ],
  },
] as const;
const settlementEvents = parseEventLogs({
  abi: paymentSettledAbi,
  logs: flareReceipt.logs.filter(
    (log) =>
      log.address.toLowerCase() === getAddress(receipt.settlement.routerAddress).toLowerCase(),
  ),
  eventName: 'PaymentSettled',
  strict: true,
});
if (
  !settlementEvents.some(
    (event) => event.args.paymentId.toLowerCase() === receipt.paymentId.toLowerCase(),
  )
) {
  throw new Error('Matching PayMorphRouter.PaymentSettled event was not found');
}

const artifact = {
  verifiedAt: new Date().toISOString(),
  attemptId,
  paymentId: receipt.paymentId,
  xrplTransactionHash: receipt.sourcePayment.txHash,
  xrplLedgerIndex: xrpl.result.ledger_index,
  flareTransactionHash: receipt.settlement.flareTxHash,
  flareBlockNumber: flareReceipt.blockNumber.toString(),
  routerAddress: getAddress(receipt.settlement.routerAddress),
  warning: 'XRPL Testnet and Coston2 tokens have no real monetary value.',
};
await mkdir('live-smoke', { recursive: true });
const artifactPath = join('live-smoke', `${attemptId}.json`);
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, artifactPath, ...artifact }, null, 2));
