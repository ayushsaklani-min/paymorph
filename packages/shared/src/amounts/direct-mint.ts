const BIPS_SCALE = 10_000n;
const MAX_UINT64 = (1n << 64n) - 1n;

export interface DirectMintFeeSettings {
  readonly feeBIPS: bigint;
  readonly minimumFeeUBA: bigint;
  readonly executorFeeUBA: bigint;
}

export interface DirectMintGrossAmount {
  readonly grossPaymentUBA: bigint;
  readonly protocolFeeUBA: bigint;
  readonly executorFeeUBA: bigint;
  readonly netMintedUBA: bigint;
}

/**
 * Mirrors DirectMintingFacet's fee calculation. The proportional fee is based
 * on the gross underlying payment, is floored, is bounded by the configured
 * minimum, and cannot exceed the payment itself.
 */
export function directMintProtocolFeeUBA(
  grossPaymentUBA: bigint,
  settings: Pick<DirectMintFeeSettings, 'feeBIPS' | 'minimumFeeUBA'>,
): bigint {
  assertUint64('grossPaymentUBA', grossPaymentUBA);
  assertFeeSettings({ ...settings, executorFeeUBA: 0n });

  const proportionalFee = (grossPaymentUBA * settings.feeBIPS) / BIPS_SCALE;
  const feeWithMinimum =
    proportionalFee > settings.minimumFeeUBA ? proportionalFee : settings.minimumFeeUBA;
  return feeWithMinimum < grossPaymentUBA ? feeWithMinimum : grossPaymentUBA;
}

/**
 * Finds the smallest gross XRPL payment whose post-protocol, post-executor
 * amount is at least the desired FXRP mint. All arithmetic stays in UBA bigint.
 */
export function solveDirectMintGrossAmount(
  desiredNetMintUBA: bigint,
  settings: DirectMintFeeSettings,
): DirectMintGrossAmount {
  assertUint64('desiredNetMintUBA', desiredNetMintUBA);
  assertFeeSettings(settings);

  if (settings.feeBIPS === BIPS_SCALE && desiredNetMintUBA > 0n) {
    throw new RangeError('A 100% direct-mint fee cannot produce a positive net mint');
  }

  const isSufficient = (grossPaymentUBA: bigint): boolean => {
    const protocolFeeUBA = directMintProtocolFeeUBA(grossPaymentUBA, settings);
    return grossPaymentUBA >= protocolFeeUBA + settings.executorFeeUBA + desiredNetMintUBA;
  };

  if (isSufficient(0n)) {
    return {
      grossPaymentUBA: 0n,
      protocolFeeUBA: 0n,
      executorFeeUBA: settings.executorFeeUBA,
      netMintedUBA: 0n,
    };
  }

  let lowerBound = 0n;
  let upperBound = desiredNetMintUBA + settings.executorFeeUBA + settings.minimumFeeUBA;
  if (upperBound > MAX_UINT64) {
    upperBound = MAX_UINT64;
  }

  while (!isSufficient(upperBound)) {
    lowerBound = upperBound;
    if (upperBound === MAX_UINT64) {
      throw new RangeError('Desired direct mint exceeds the uint64 underlying-amount range');
    }
    upperBound = upperBound > MAX_UINT64 / 2n ? MAX_UINT64 : upperBound * 2n + 1n;
  }

  while (lowerBound + 1n < upperBound) {
    const candidate = lowerBound + (upperBound - lowerBound) / 2n;
    if (isSufficient(candidate)) {
      upperBound = candidate;
    } else {
      lowerBound = candidate;
    }
  }

  const grossPaymentUBA = upperBound;
  const protocolFeeUBA = directMintProtocolFeeUBA(grossPaymentUBA, settings);
  const netMintedUBA = grossPaymentUBA - protocolFeeUBA - settings.executorFeeUBA;

  return {
    grossPaymentUBA,
    protocolFeeUBA,
    executorFeeUBA: settings.executorFeeUBA,
    netMintedUBA,
  };
}

function assertFeeSettings(settings: DirectMintFeeSettings): void {
  if (settings.feeBIPS < 0n || settings.feeBIPS > BIPS_SCALE) {
    throw new RangeError('feeBIPS must be from 0 to 10,000');
  }
  assertUint64('minimumFeeUBA', settings.minimumFeeUBA);
  assertUint64('executorFeeUBA', settings.executorFeeUBA);
}

function assertUint64(name: string, value: bigint): void {
  if (value < 0n || value > MAX_UINT64) {
    throw new RangeError(`${name} must be an unsigned 64-bit integer`);
  }
}
