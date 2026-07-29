export interface FtsoRationalValue {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/**
 * Converts FTSO's signed int8 decimal exponent into an exact rational value.
 * The protocol value is `value * 10^(-decimals)`.
 */
export function ftsoValueAsRational(value: bigint, decimals: number): FtsoRationalValue {
  if (value < 0n) {
    throw new RangeError('FTSO uint256 value cannot be negative');
  }
  if (!Number.isInteger(decimals) || decimals < -128 || decimals > 127) {
    throw new RangeError('FTSO decimals must be a signed int8');
  }

  if (decimals >= 0) {
    return {
      numerator: value,
      denominator: 10n ** BigInt(decimals),
    };
  }
  return {
    numerator: value * 10n ** BigInt(-decimals),
    denominator: 1n,
  };
}
