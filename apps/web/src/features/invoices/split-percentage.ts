const PERCENTAGE = /^(100(?:\.0{1,2})?|(?:0|[1-9][0-9]?)(?:\.[0-9]{1,2})?)$/;

export function percentageToBps(value: string): number | null {
  const normalized = value.trim();
  if (!PERCENTAGE.test(normalized)) return null;

  const [whole = '0', fraction = ''] = normalized.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bps > 0 && bps <= 10_000 ? bps : null;
}

export function bpsToPercentageInput(bps: number): string {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new RangeError('Split basis points must be a non-negative integer');
  }

  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function formatSplitPercentage(bps: number): string {
  return `${bpsToPercentageInput(bps)}%`;
}
