// The two-buffer bounds: price slippage + fee headroom (brief section 7.2).
//
// Fee adjustment (the headroom buffer), going from f_now to f_max >= f_now:
//   exact-in:  output scales with the effective input (1 - f). The estimate
//              out * (1 - f_max)/(1 - f_now) is a CONSERVATIVE lower bound on
//              the true output at f_max (constant-product output is concave in
//              input), so the resulting amountOutMin never over-tightens.
//   exact-out: input = baseIn / (1 - f), and baseIn is independent of f, so
//              in * (1 - f_now)/(1 - f_max) is EXACT.
//
// Then the price-slippage buffer is applied (down for min-out, up for max-in),
// and we round to never cause a spurious revert (floor the min, ceil the max).
//
// Preview/sizing only: the swap still executes through the router, and the live
// price/fee come from the V4Quoter.

import { PIPS_DENOMINATOR, TIERS, type PoolTier } from '@spry/fee';
import { resolveProtectionFeePips, DEFAULT_FEE_PROTECTION, DEFAULT_SLIPPAGE_BPS } from './fee';
import type { ProtectionConfig, ExactInProtection, ExactOutProtection } from './types';

const PIPS = BigInt(PIPS_DENOMINATOR);
const BPS = 10_000n;

/** Default two-part tolerance: 0.50% price slippage + BOUNDED fee headroom. */
export const DEFAULT_PROTECTION: ProtectionConfig = {
  slippageBps: DEFAULT_SLIPPAGE_BPS,
  fee: DEFAULT_FEE_PROTECTION,
};

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

function assertFeePair(feeNowPips: number, feeMaxPips: number): void {
  if (!Number.isInteger(feeNowPips) || feeNowPips < 0 || feeNowPips >= PIPS_DENOMINATOR) {
    throw new RangeError(`feeNowPips must be an integer in [0, ${PIPS_DENOMINATOR})`);
  }
  if (!Number.isInteger(feeMaxPips) || feeMaxPips < feeNowPips || feeMaxPips >= PIPS_DENOMINATOR) {
    throw new RangeError(`feeMaxPips must be an integer in [feeNowPips, ${PIPS_DENOMINATOR})`);
  }
}

/**
 * Minimum output for an exact-input swap, covering the fee rising to `feeMaxPips`
 * and `slippageBps` of price slippage. Floors (a safe lower bound).
 */
export function amountOutMinExactIn(args: {
  amountOut: bigint;
  feeNowPips: number;
  feeMaxPips: number;
  slippageBps: number;
}): bigint {
  const { amountOut, feeNowPips, feeMaxPips, slippageBps } = args;
  if (amountOut < 0n) throw new RangeError('amountOut must be non-negative');
  assertFeePair(feeNowPips, feeMaxPips);
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new RangeError('slippageBps must be an integer in [0, 10000)');
  }
  const num = (PIPS - BigInt(feeMaxPips)) * BigInt(10_000 - slippageBps);
  const den = (PIPS - BigInt(feeNowPips)) * BPS;
  return (amountOut * num) / den; // floor
}

/**
 * Maximum input for an exact-output swap, covering the fee rising to `feeMaxPips`
 * and `slippageBps` of price slippage. Ceils (a safe upper bound).
 */
export function amountInMaxExactOut(args: {
  amountIn: bigint;
  feeNowPips: number;
  feeMaxPips: number;
  slippageBps: number;
}): bigint {
  const { amountIn, feeNowPips, feeMaxPips, slippageBps } = args;
  if (amountIn < 0n) throw new RangeError('amountIn must be non-negative');
  assertFeePair(feeNowPips, feeMaxPips);
  if (!Number.isInteger(slippageBps) || slippageBps < 0) {
    throw new RangeError('slippageBps must be a non-negative integer');
  }
  const num = (PIPS - BigInt(feeNowPips)) * BigInt(10_000 + slippageBps);
  const den = (PIPS - BigInt(feeMaxPips)) * BPS;
  return ceilDiv(amountIn * num, den); // ceil
}

/** Protect an exact-input swap given the current fee, the tier cap, and a policy. */
export function protectExactIn(input: {
  amountOut: bigint;
  feeNowPips: number;
  capFeePips: number;
  protection?: ProtectionConfig;
}): ExactInProtection {
  const protection = input.protection ?? DEFAULT_PROTECTION;
  const feeMaxPips = resolveProtectionFeePips(protection.fee, input.feeNowPips, input.capFeePips);
  const amountOutMin = amountOutMinExactIn({
    amountOut: input.amountOut,
    feeNowPips: input.feeNowPips,
    feeMaxPips,
    slippageBps: protection.slippageBps,
  });
  return { amountOutMin, feeNowPips: input.feeNowPips, feeMaxPips, slippageBps: protection.slippageBps };
}

/** Protect an exact-output swap given the current fee, the tier cap, and a policy. */
export function protectExactOut(input: {
  amountIn: bigint;
  feeNowPips: number;
  capFeePips: number;
  protection?: ProtectionConfig;
}): ExactOutProtection {
  const protection = input.protection ?? DEFAULT_PROTECTION;
  const feeMaxPips = resolveProtectionFeePips(protection.fee, input.feeNowPips, input.capFeePips);
  const amountInMax = amountInMaxExactOut({
    amountIn: input.amountIn,
    feeNowPips: input.feeNowPips,
    feeMaxPips,
    slippageBps: protection.slippageBps,
  });
  return { amountInMax, feeNowPips: input.feeNowPips, feeMaxPips, slippageBps: protection.slippageBps };
}

/** {@link protectExactIn} with the tier cap looked up from the tier table. */
export function protectExactInForTier(
  tier: PoolTier,
  input: { amountOut: bigint; feeNowPips: number; protection?: ProtectionConfig },
): ExactInProtection {
  return protectExactIn({
    amountOut: input.amountOut,
    feeNowPips: input.feeNowPips,
    capFeePips: TIERS[tier].capFeePips,
    ...(input.protection ? { protection: input.protection } : {}),
  });
}

/** {@link protectExactOut} with the tier cap looked up from the tier table. */
export function protectExactOutForTier(
  tier: PoolTier,
  input: { amountIn: bigint; feeNowPips: number; protection?: ProtectionConfig },
): ExactOutProtection {
  return protectExactOut({
    amountIn: input.amountIn,
    feeNowPips: input.feeNowPips,
    capFeePips: TIERS[tier].capFeePips,
    ...(input.protection ? { protection: input.protection } : {}),
  });
}
