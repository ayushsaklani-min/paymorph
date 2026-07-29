const DECIMAL_BASE_UNITS = /^(0|[1-9]\d*)$/;
const DISPLAY_AMOUNT = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export * from './direct-mint.js';

export type BaseUnitString = string & { readonly __brand: 'BaseUnitString' };

export function parseBaseUnits(value: string): bigint {
  if (!DECIMAL_BASE_UNITS.test(value)) {
    throw new TypeError('Amount must be a canonical non-negative base-unit string');
  }
  return BigInt(value);
}

export function toBaseUnitString(value: bigint): BaseUnitString {
  if (value < 0n) {
    throw new RangeError('Amount cannot be negative');
  }
  return value.toString(10) as BaseUnitString;
}

export function parseDisplayAmount(value: string, decimals: number): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError('Decimals must be an integer from 0 to 255');
  }
  const match = DISPLAY_AMOUNT.exec(value);
  if (!match) {
    throw new TypeError('Amount must be a positive decimal notation without signs or exponent');
  }
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    throw new RangeError(`Amount has more than ${decimals} decimal places`);
  }
  const scale = 10n ** BigInt(decimals);
  return BigInt(match[1] ?? '0') * scale + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function formatBaseUnits(value: bigint, decimals: number): string {
  if (value < 0n) {
    throw new RangeError('Amount cannot be negative');
  }
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}

export function ceilBps(amount: bigint, bps: number): bigint {
  assertBps(bps);
  if (amount < 0n) {
    throw new RangeError('Amount cannot be negative');
  }
  if (amount === 0n || bps === 0) return 0n;
  return (amount * BigInt(bps) + 9_999n) / 10_000n;
}

export function splitByBps(amount: bigint, bps: readonly number[]): bigint[] {
  if (amount < 0n) {
    throw new RangeError('Amount cannot be negative');
  }
  if (bps.length === 0 || bps.length > 10) {
    throw new RangeError('A split requires one to ten recipients');
  }
  bps.forEach(assertPositiveBps);
  if (bps.reduce((sum, value) => sum + value, 0) !== 10_000) {
    throw new RangeError('Recipient basis points must total exactly 10,000');
  }

  let distributed = 0n;
  return bps.map((value, index) => {
    const share =
      index === bps.length - 1 ? amount - distributed : (amount * BigInt(value)) / 10_000n;
    distributed += share;
    return share;
  });
}

function assertBps(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new RangeError('Basis points must be an integer from 0 to 10,000');
  }
}

function assertPositiveBps(value: number): void {
  assertBps(value);
  if (value === 0) {
    throw new RangeError('Recipient basis points must be positive');
  }
}

export * from './direct-mint.js';
export * from './pricing.js';
