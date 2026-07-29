import { db, AttemptStatus } from '@paymorph/db';
import { DomainError, formatBaseUnits } from '@paymorph/shared';
import { z } from 'zod';

const settledEventSchema = z.object({
  asset: z.enum(['FXRP', 'USDT0']),
  invoiceAmount: z.string().regex(/^(0|[1-9]\d*)$/),
  serviceFee: z.string().regex(/^(0|[1-9]\d*)$/),
  inputFxrpUsed: z.string().regex(/^(0|[1-9]\d*)$/),
  refundTo: z.string(),
  refundFxrp: z.string().regex(/^(0|[1-9]\d*)$/),
  payerPersonalAccount: z.string(),
  routerAddress: z.string(),
  routerVersion: z.string().default('1'),
  assetManagerAddress: z.string(),
});

const recipientEventSchema = z.object({
  recipient: z.string(),
  token: z.string(),
  amount: z.string().regex(/^(0|[1-9]\d*)$/),
  bps: z.number().int(),
});

export async function buildPublicReceipt(attemptId: string) {
  const attempt = await db.paymentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      invoice: {
        include: {
          merchant: { select: { displayName: true } },
          recipients: { orderBy: { position: 'asc' } },
        },
      },
      quote: true,
      chainEvents: { orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }] },
    },
  });
  if (!attempt || attempt.status !== AttemptStatus.SETTLED) {
    throw new DomainError('FORBIDDEN', 'Settled receipt not found');
  }
  const settlementEvent = attempt.chainEvents.find((event) => event.eventName === 'PaymentSettled');
  if (!settlementEvent || !attempt.xrplTxHash || !attempt.flareTxHash || !attempt.settledAt) {
    throw new DomainError(
      'INTERNAL_ERROR',
      'Receipt projection is incomplete and requires reconciliation',
    );
  }
  const settlement = settledEventSchema.parse(settlementEvent.payloadJson);
  const paidEvents = attempt.chainEvents
    .filter((event) => event.eventName === 'RecipientPaid')
    .map((event) => ({
      event,
      payload: recipientEventSchema.parse(event.payloadJson),
    }));
  const recipients = attempt.invoice.recipients.map((recipient) => {
    const paid = paidEvents.find(
      ({ payload }) => payload.recipient.toLowerCase() === recipient.address.toLowerCase(),
    );
    if (!paid) {
      throw new DomainError(
        'INTERNAL_ERROR',
        `Receipt is missing RecipientPaid evidence for ${recipient.address}`,
      );
    }
    return {
      label: recipient.label,
      address: recipient.address,
      bps: recipient.bps,
      amount: paid.payload.amount,
      token: paid.payload.token,
      txHash: paid.event.txHash,
    };
  });

  const xrplExplorer = process.env.XRPL_EXPLORER_URL ?? 'https://testnet.xrpl.org/transactions';
  const coston2Explorer =
    process.env.COSTON2_EXPLORER_URL ?? 'https://coston2-explorer.flare.network';
  const sourceAmount = attempt.quote.xrplPaymentDrops.toFixed(0);

  return {
    attemptId: attempt.id,
    paymentId: attempt.paymentId,
    status: 'SETTLED' as const,
    testnet: true,
    invoice: {
      id: attempt.invoice.id,
      title: attempt.invoice.title,
      externalRef: attempt.invoice.externalRef,
      merchant: attempt.invoice.merchant,
      denomination: attempt.invoice.denomination,
      requestedBaseUnits: attempt.invoice.amountBaseUnits.toFixed(0),
    },
    payer: { xrplAccount: attempt.payerXrplAccount },
    sourcePayment: {
      xrpDrops: sourceAmount,
      xrpDisplay: formatBaseUnits(BigInt(sourceAmount), 6),
      txHash: attempt.xrplTxHash,
      explorerUrl: `${xrplExplorer.replace(/\/$/, '')}/${attempt.xrplTxHash}`,
      ledgerIndex: attempt.xrplLedgerIndex?.toString() ?? null,
    },
    settlement: {
      asset: settlement.asset,
      invoiceAmount: settlement.invoiceAmount,
      serviceFee: settlement.serviceFee,
      inputFxrpUsed: settlement.inputFxrpUsed,
      refundFxrp: settlement.refundFxrp,
      refundTo: settlement.refundTo,
      flareTxHash: attempt.flareTxHash,
      explorerUrl: `${coston2Explorer.replace(/\/$/, '')}/tx/${attempt.flareTxHash}`,
      settledAt: attempt.settledAt,
      routerAddress: settlement.routerAddress,
      version: settlement.routerVersion,
    },
    recipients,
    protocol: {
      userOpHash: attempt.quote.userOpHash,
      personalAccount: attempt.personalAccount,
      assetManagerAddress: settlement.assetManagerAddress,
    },
  };
}
