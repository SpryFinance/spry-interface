// Immutable tier table. Hardcoded by design (the brief, and the on-chain
// `tierParams` being `pure` with no setter/owner/upgrade path, both say so):
// never query it. Base/cap fees and tick spacings mirror `SpryHook`.

import { PoolTier, type TierInfo } from './types';
import { VALID_TICK_SPACINGS } from './constants';

/** Tier metadata keyed by `PoolTier`. */
export const TIERS: Record<PoolTier, TierInfo> = {
  [PoolTier.STABLE]: {
    tier: PoolTier.STABLE,
    index: 0,
    tickSpacing: 1,
    baseFeePips: 100, // 0.01%
    capFeePips: 5_000, // 0.50%
    label: 'Stable',
    typicalPairs: 'pegged / stable',
  },
  [PoolTier.LIKE_ASSET]: {
    tier: PoolTier.LIKE_ASSET,
    index: 1,
    tickSpacing: 10,
    baseFeePips: 500, // 0.05%
    capFeePips: 10_000, // 1.00%
    label: 'Like-asset',
    typicalPairs: 'LSTs, wrappers',
  },
  [PoolTier.BLUE_CHIP]: {
    tier: PoolTier.BLUE_CHIP,
    index: 2,
    tickSpacing: 60,
    baseFeePips: 3_000, // 0.30%
    capFeePips: 55_000, // 5.50%
    label: 'Blue-chip',
    typicalPairs: 'ETH, majors',
  },
  [PoolTier.VOLATILE]: {
    tier: PoolTier.VOLATILE,
    index: 3,
    tickSpacing: 200,
    baseFeePips: 5_000, // 0.50%
    capFeePips: 90_000, // 9.00%
    label: 'Volatile',
    typicalPairs: 'mid-cap',
  },
  [PoolTier.EXOTIC]: {
    tier: PoolTier.EXOTIC,
    index: 4,
    tickSpacing: 1_000,
    baseFeePips: 10_000, // 1.00%
    capFeePips: 99_000, // 9.90%
    label: 'Exotic',
    typicalPairs: 'long-tail',
  },
};

/** Tiers ordered by their on-chain index (0..4). */
export const TIER_BY_INDEX: readonly TierInfo[] = [
  TIERS[PoolTier.STABLE],
  TIERS[PoolTier.LIKE_ASSET],
  TIERS[PoolTier.BLUE_CHIP],
  TIERS[PoolTier.VOLATILE],
  TIERS[PoolTier.EXOTIC],
];

/** Tier metadata keyed by tick spacing (1 / 10 / 60 / 200 / 1000). */
export const TIER_BY_TICK_SPACING: Record<number, TierInfo> = {
  1: TIERS[PoolTier.STABLE],
  10: TIERS[PoolTier.LIKE_ASSET],
  60: TIERS[PoolTier.BLUE_CHIP],
  200: TIERS[PoolTier.VOLATILE],
  1000: TIERS[PoolTier.EXOTIC],
};

/** Full metadata for a tier. */
export function tierInfo(tier: PoolTier): TierInfo {
  return TIERS[tier];
}

/**
 * Map a pool's `tickSpacing` to its tier. Throws for any tick spacing outside
 * the sanctioned set (matching the hook's `InvalidTier` revert).
 */
export function tierFromTickSpacing(tickSpacing: number): PoolTier {
  const info = TIER_BY_TICK_SPACING[tickSpacing];
  if (info === undefined) {
    throw new RangeError(
      `invalid Spry tick spacing: ${tickSpacing} (expected one of ${VALID_TICK_SPACINGS.join(', ')})`,
    );
  }
  return info.tier;
}

/** The tick spacing a given tier uses. */
export function tickSpacingForTier(tier: PoolTier): number {
  return TIERS[tier].tickSpacing;
}

/** Decode an on-chain tier index (0..4) to a `PoolTier`. */
export function tierFromIndex(index: number): PoolTier {
  const info = TIER_BY_INDEX[index];
  if (info === undefined) throw new RangeError(`invalid tier index: ${index}`);
  return info.tier;
}

/** `true` iff `tickSpacing` is one of the five sanctioned Spry values. */
export function isValidTickSpacing(tickSpacing: number): boolean {
  return Object.prototype.hasOwnProperty.call(TIER_BY_TICK_SPACING, tickSpacing);
}
