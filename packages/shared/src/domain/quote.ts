import {
  applySlippageCeil,
  ceilBps,
  solveDirectMintGrossAmount,
  usdCentsToFxrpUBA,
  usdCentsToUsdt0BaseUnits,
  xrpUbaToUsdt0BaseUnits,
  type DirectMintFeeSettings,
} from '../amounts/index.js';

export type QuoteDenomination = 'XRP' | 'USD';
export type QuoteSettlementAsset = 'FXRP' | 'USDT0';

export interface QuoteCalculationInput {
  denomination: QuoteDenomination;
  settlementAsset: QuoteSettlementAsset;
  invoiceBaseUnits: bigint;
  serviceFeeBps: number;
  slippageBps: number;
  xrpUsdValue: bigint;
  xrpUsdDecimals: number;
  directMintSettings: DirectMintFeeSettings;
  exactOutputFxrpQuoteUBA?: bigint;
}

export interface QuoteCalculation {
  invoiceOutBaseUnits: bigint;
  serviceFeeOutBaseUnits: bigint;
  maxFxrpInputUBA: bigint;
  protocolMintFeeUBA: bigint;
  executorFeeUBA: bigint;
  xrplPaymentDrops: bigint;
  route: 'DIRECT_FXRP' | 'EXACT_OUTPUT_V3';
}

export type SettlementOutputInput = Pick<
  QuoteCalculationInput,
  'denomination' | 'settlementAsset' | 'invoiceBaseUnits' | 'xrpUsdValue' | 'xrpUsdDecimals'
>;

export function calculateQuote(input: QuoteCalculationInput): QuoteCalculation {
  if (input.invoiceBaseUnits <= 0n) throw new RangeError('Invoice amount must be positive');
  const invoiceOutBaseUnits = calculateSettlementOutput(input);
  const serviceFeeOutBaseUnits = ceilBps(invoiceOutBaseUnits, input.serviceFeeBps);

  let maxFxrpInputUBA: bigint;
  let route: QuoteCalculation['route'];
  if (input.settlementAsset === 'FXRP') {
    maxFxrpInputUBA = invoiceOutBaseUnits + serviceFeeOutBaseUnits;
    route = 'DIRECT_FXRP';
  } else {
    if (input.exactOutputFxrpQuoteUBA === undefined || input.exactOutputFxrpQuoteUBA <= 0n) {
      throw new RangeError('A real exact-output FXRP quote is required for USDT0 settlement');
    }
    maxFxrpInputUBA = applySlippageCeil(input.exactOutputFxrpQuoteUBA, input.slippageBps);
    route = 'EXACT_OUTPUT_V3';
  }

  const directMint = solveDirectMintGrossAmount(maxFxrpInputUBA, input.directMintSettings);
  return {
    invoiceOutBaseUnits,
    serviceFeeOutBaseUnits,
    maxFxrpInputUBA,
    protocolMintFeeUBA:
      directMint.grossPaymentUBA - directMint.netMintedUBA - directMint.executorFeeUBA,
    executorFeeUBA: directMint.executorFeeUBA,
    xrplPaymentDrops: directMint.grossPaymentUBA,
    route,
  };
}

/**
 * Resolves the exact settlement-token amount before service fees. USDT0 USD
 * amounts are integer-cent conversions; XRP denomination uses the same
 * rational FTSO value captured by the eventual quote.
 */
export function calculateSettlementOutput(input: SettlementOutputInput): bigint {
  if (input.invoiceBaseUnits <= 0n) throw new RangeError('Invoice amount must be positive');
  if (input.settlementAsset === 'FXRP') {
    return input.denomination === 'XRP'
      ? input.invoiceBaseUnits
      : usdCentsToFxrpUBA(input.invoiceBaseUnits, input.xrpUsdValue, input.xrpUsdDecimals);
  }
  return input.denomination === 'USD'
    ? usdCentsToUsdt0BaseUnits(input.invoiceBaseUnits)
    : xrpUbaToUsdt0BaseUnits(input.invoiceBaseUnits, input.xrpUsdValue, input.xrpUsdDecimals);
}
