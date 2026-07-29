const XRP_UBA_SCALE = 1_000_000n;
const USD_CENT_SCALE = 100n;
const USDT0_BASE_UNITS_PER_CENT = 10_000n;

export interface RationalPrice {
  numerator: bigint;
  denominator: bigint;
}

/**
 * Converts an FTSO pair `(value, decimals)` into exact rational USD/XRP.
 * Flare defines the display value as `value / 10^decimals`; a negative
 * exponent therefore multiplies the integer value.
 */
export function ftsoPriceAsRational(value: bigint, decimals: number): RationalPrice {
  if (value <= 0n) throw new RangeError('FTSO price must be positive');
  if (!Number.isSafeInteger(decimals) || decimals < -128 || decimals > 127) {
    throw new RangeError('FTSO decimals must fit int8');
  }
  return decimals >= 0
    ? { numerator: value, denominator: 10n ** BigInt(decimals) }
    : { numerator: value * 10n ** BigInt(-decimals), denominator: 1n };
}

export function usdCentsToFxrpUBA(
  usdCents: bigint,
  xrpUsdValue: bigint,
  xrpUsdDecimals: number,
): bigint {
  assertPositiveAmount(usdCents, 'USD cents');
  const price = ftsoPriceAsRational(xrpUsdValue, xrpUsdDecimals);
  return ceilDiv(usdCents * price.denominator * XRP_UBA_SCALE, USD_CENT_SCALE * price.numerator);
}

export function xrpUbaToUsdt0BaseUnits(
  xrpUBA: bigint,
  xrpUsdValue: bigint,
  xrpUsdDecimals: number,
): bigint {
  assertPositiveAmount(xrpUBA, 'XRP UBA');
  const price = ftsoPriceAsRational(xrpUsdValue, xrpUsdDecimals);
  // Both XRP and USDT0 use 6 base-unit decimals, so their scales cancel.
  return ceilDiv(xrpUBA * price.numerator, price.denominator);
}

export function usdCentsToUsdt0BaseUnits(usdCents: bigint): bigint {
  assertPositiveAmount(usdCents, 'USD cents');
  return usdCents * USDT0_BASE_UNITS_PER_CENT;
}

export function applySlippageCeil(amount: bigint, slippageBps: number): bigint {
  assertPositiveAmount(amount, 'Quoted input');
  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new RangeError('Slippage must be an integer from 0 to 10,000 bps');
  }
  return ceilDiv(amount * BigInt(10_000 + slippageBps), 10_000n);
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError('ceilDiv requires a non-negative numerator and positive denominator');
  }
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

function assertPositiveAmount(value: bigint, label: string): void {
  if (value <= 0n) throw new RangeError(`${label} must be positive`);
}
