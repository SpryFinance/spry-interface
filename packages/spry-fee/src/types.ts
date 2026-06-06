// Core types for the Spry fee model.
//
// The enum string values intentionally match the Spry subgraph's GraphQL
// enums (`PoolTier`, `SpryZone`, `SpryDispatchCase`) so subgraph rows and
// locally-computed values are directly comparable. The `SpryFee` event and a
// few subgraph fields (`zoneId`, `dispatchCaseId`) use the numeric index
// instead; the `*_BY_INDEX` / `*_INDEX` maps below convert between the two.

/**
 * Asset/risk bucket, selected at pool creation via `tickSpacing`. Each tier has
 * a fixed base fee and a fixed cap fee that never change. Distinct from the
 * dynamic fee (the actual per-swap LP fee), which varies within those bounds.
 */
export enum PoolTier {
  STABLE = 'STABLE',
  LIKE_ASSET = 'LIKE_ASSET',
  BLUE_CHIP = 'BLUE_CHIP',
  VOLATILE = 'VOLATILE',
  EXOTIC = 'EXOTIC',
}

/** Fee-curve zone of a (cumulative) delta. Mirrors `SpryFee.zone` (0..3). */
export enum SpryZone {
  SAFE = 'SAFE',
  ALERT = 'ALERT',
  DANGER = 'DANGER',
  CAP = 'CAP',
}

/** Integral-mode dispatch case for a swap. Mirrors `SpryFee.dispatchCase` (0..2). */
export enum SpryDispatchCase {
  GROWTH = 'GROWTH',
  UNWIND = 'UNWIND',
  FLIP = 'FLIP',
}

/** `SpryZone` ordered by its on-chain numeric index (`zoneId`). */
export const ZONE_BY_INDEX = [
  SpryZone.SAFE,
  SpryZone.ALERT,
  SpryZone.DANGER,
  SpryZone.CAP,
] as const;

/** `SpryDispatchCase` ordered by its on-chain numeric index (`dispatchCaseId`). */
export const DISPATCH_CASE_BY_INDEX = [
  SpryDispatchCase.GROWTH,
  SpryDispatchCase.UNWIND,
  SpryDispatchCase.FLIP,
] as const;

/** `SpryZone` -> numeric index. */
export const ZONE_INDEX: Record<SpryZone, number> = {
  [SpryZone.SAFE]: 0,
  [SpryZone.ALERT]: 1,
  [SpryZone.DANGER]: 2,
  [SpryZone.CAP]: 3,
};

/** `SpryDispatchCase` -> numeric index. */
export const DISPATCH_CASE_INDEX: Record<SpryDispatchCase, number> = {
  [SpryDispatchCase.GROWTH]: 0,
  [SpryDispatchCase.UNWIND]: 1,
  [SpryDispatchCase.FLIP]: 2,
};

/** Decode a numeric `SpryFee.zone` (0..3) to a `SpryZone`. */
export function zoneFromIndex(index: number): SpryZone {
  const zone = ZONE_BY_INDEX[index];
  if (zone === undefined) throw new RangeError(`invalid zone index: ${index}`);
  return zone;
}

/** Decode a numeric `SpryFee.dispatchCase` (0..2) to a `SpryDispatchCase`. */
export function dispatchCaseFromIndex(index: number): SpryDispatchCase {
  const dispatchCase = DISPATCH_CASE_BY_INDEX[index];
  if (dispatchCase === undefined) {
    throw new RangeError(`invalid dispatch-case index: ${index}`);
  }
  return dispatchCase;
}

/**
 * One complete tier definition for the four-zone curve, mirroring the on-chain
 * `SpryFeeParams` struct returned by `SpryHook.tierParams(uint8)`.
 *
 * Units:
 * - Zone bounds are signed per-mille of reserve shift (the "delta" unit).
 * - `aLeft`/`bLeft`/`aRight`/`bRight` are the linear (alert-zone) coefficients
 *   (`int64` on-chain; fit safely in a JS number).
 * - `aLeftExp`/`bLeftExp`/`aRightExp`/`bRightExp` are the exponential
 *   (danger-zone) coefficients, SD59x18-scaled (`int128` on-chain; kept as
 *   `bigint` because they exceed `Number.MAX_SAFE_INTEGER`).
 * - `safeFee`/`capFee` are flat fees in pips.
 */
export interface SpryFeeParams {
  safeLow: number;
  safeHigh: number;
  alertLow: number;
  alertHigh: number;
  dangerLow: number;
  dangerHigh: number;
  aLeft: number;
  bLeft: number;
  aRight: number;
  bRight: number;
  aLeftExp: bigint;
  bLeftExp: bigint;
  aRightExp: bigint;
  bRightExp: bigint;
  safeFee: number;
  capFee: number;
}

/** Static, immutable metadata for a tier (base/cap fee, tick spacing, labels). */
export interface TierInfo {
  tier: PoolTier;
  /** On-chain tier index (0..4), as used by `tierParams(uint8)` and the event. */
  index: number;
  tickSpacing: number;
  /** Base (safe) fee in pips. */
  baseFeePips: number;
  /** Cap fee in pips (the worst case the dynamic fee can reach). */
  capFeePips: number;
  /** Human label, e.g. "Blue-chip". */
  label: string;
  /** Typical pairs for this tier (informational). */
  typicalPairs: string;
}
