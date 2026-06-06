// Types for the dynamic-fee-aware slippage model (brief section 7).

/**
 * How much fee headroom to protect against. The quoted fee is only a lower
 * bound: within a block window, other swaps can push the pool's cumulative
 * deeper, raising the fee for our swap up to the tier cap. `f_max` is the fee
 * we size the bound against.
 */
export enum FeePolicy {
  /** `f_max = capFee`. Never reverts on fee; costs the most output headroom. */
  WORST_CASE = 'WORST_CASE',
  /** `f_max = min(cap, f_now + delta)`. Balances protection vs revert rate. The default. */
  BOUNDED = 'BOUNDED',
  /** `f_max = f_now`. Opt-in and risky: reverts if anyone trades first in the window. */
  AS_QUOTED = 'AS_QUOTED',
}

/** Fee-headroom policy. For BOUNDED, the headroom `delta` is either a fixed pip
 *  amount (`tolerancePips`) or a fraction of the remaining distance to the cap
 *  (`headroomFraction`, 0..1); `tolerancePips` wins if both are set. */
export interface FeeProtection {
  policy: FeePolicy;
  tolerancePips?: number;
  headroomFraction?: number;
}

/** The full two-part tolerance: price slippage plus the fee-headroom policy. */
export interface ProtectionConfig {
  /** Price-slippage tolerance in basis points (e.g. 50 = 0.50%). */
  slippageBps: number;
  fee: FeeProtection;
}

/** Result of protecting an exact-input swap. */
export interface ExactInProtection {
  /** The minimum output to pass as `amountOutMin`. */
  amountOutMin: bigint;
  /** The current implied fee used as the baseline (pips). */
  feeNowPips: number;
  /** The protection fee the bound was sized against (pips). */
  feeMaxPips: number;
  /** The price-slippage tolerance applied (bps). */
  slippageBps: number;
}

/** Result of protecting an exact-output swap. */
export interface ExactOutProtection {
  /** The maximum input to pass as `amountInMax`. */
  amountInMax: bigint;
  feeNowPips: number;
  feeMaxPips: number;
  slippageBps: number;
}
