// Resolving the protection fee `f_max`, and deriving the current implied fee
// `f_now` from a quote (the (gross - net) / gross method, brief section 5.1).

import { PIPS_DENOMINATOR } from '@spry/fee';
import { FeePolicy, type FeeProtection } from './types';

const PIPS = BigInt(PIPS_DENOMINATOR);

/** Default price-slippage tolerance: 0.50%. */
export const DEFAULT_SLIPPAGE_BPS = 50;
/** Default BOUNDED headroom: halfway from the current fee to the tier cap. */
export const DEFAULT_HEADROOM_FRACTION = 0.5;
/** Default fee protection: BOUNDED at half the remaining headroom to the cap. */
export const DEFAULT_FEE_PROTECTION: FeeProtection = {
  policy: FeePolicy.BOUNDED,
  headroomFraction: DEFAULT_HEADROOM_FRACTION,
};

function assertFeePips(label: string, pips: number): void {
  if (!Number.isFinite(pips) || pips < 0 || pips >= PIPS_DENOMINATOR) {
    throw new RangeError(`${label} must be in [0, ${PIPS_DENOMINATOR}): got ${pips}`);
  }
}

/** Validate the (feeNow, cap) pair the slippage math depends on. */
export function assertFeeBounds(feeNowPips: number, capFeePips: number): void {
  assertFeePips('feeNowPips', feeNowPips);
  assertFeePips('capFeePips', capFeePips);
  if (feeNowPips > capFeePips) {
    throw new RangeError(`feeNowPips (${feeNowPips}) exceeds capFeePips (${capFeePips})`);
  }
}

/**
 * Resolve the protection fee `f_max` for a policy, clamped to
 * `[feeNowPips, capFeePips]`. This is the fee the output/input bound is sized
 * against (brief section 7.2).
 */
export function resolveProtectionFeePips(
  fee: FeeProtection,
  feeNowPips: number,
  capFeePips: number,
): number {
  assertFeeBounds(feeNowPips, capFeePips);
  switch (fee.policy) {
    case FeePolicy.AS_QUOTED:
      return feeNowPips;
    case FeePolicy.WORST_CASE:
      return capFeePips;
    case FeePolicy.BOUNDED: {
      const delta =
        fee.tolerancePips ??
        Math.round((capFeePips - feeNowPips) * (fee.headroomFraction ?? DEFAULT_HEADROOM_FRACTION));
      return Math.min(capFeePips, feeNowPips + Math.max(0, delta));
    }
    default:
      throw new RangeError(`unknown fee policy: ${String(fee.policy)}`);
  }
}

/**
 * Implied current fee (pips) for an exact-input swap: `(grossOut - netOut) / grossOut`.
 * `grossOut` is the zero-fee constant-product output; `netOut` is the Quoter's
 * output at the current fee. Preview only (brief section 5.1).
 */
export function impliedFeePipsExactIn(grossOut: bigint, netOut: bigint): number {
  if (grossOut <= 0n) throw new RangeError('grossOut must be positive');
  if (netOut < 0n || netOut > grossOut) throw new RangeError('netOut must be in [0, grossOut]');
  return Number(((grossOut - netOut) * PIPS) / grossOut);
}

/**
 * Implied current fee (pips) for an exact-output swap: `(netIn - grossIn) / netIn`.
 * `grossIn` is the zero-fee constant-product input; `netIn` is the Quoter's
 * input at the current fee. Preview only.
 */
export function impliedFeePipsExactOut(netIn: bigint, grossIn: bigint): number {
  if (netIn <= 0n) throw new RangeError('netIn must be positive');
  if (grossIn < 0n || grossIn > netIn) throw new RangeError('grossIn must be in [0, netIn]');
  return Number(((netIn - grossIn) * PIPS) / netIn);
}
