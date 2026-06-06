// Cached curve parameters, one set per tier.
//
// These are the EXACT values baked into `SpryHook` (`_tierStable` ...
// `_tierExotic`). The on-chain `tierParams(uint8)` is `pure` with no upgrade
// path, so caching them here is safe and avoids five `eth_call`s at boot.
//
// CHARTS AND CLIENT-SIDE PREVIEW ONLY. Never size a real trade from these:
// execution pricing goes through the `V4Quoter`. See `./curve`.
//
// The danger-zone exponential coefficients exceed Number.MAX_SAFE_INTEGER and
// are therefore `bigint` literals (verbatim from the contract).

import { PoolTier, type SpryFeeParams } from './types';

/** Curve parameters keyed by `PoolTier`. */
export const TIER_PARAMS: Record<PoolTier, SpryFeeParams> = {
  // Tier 0: STABLE.  safe +/-0.01% / alert->0.05% / danger->0.25% / cap 0.50%
  [PoolTier.STABLE]: {
    safeLow: -500,
    safeHigh: 500,
    alertLow: -1_000,
    alertHigh: 1_500,
    dangerLow: -2_000,
    dangerHigh: 5_000,
    aLeft: -800_000,
    bLeft: -300_000,
    aRight: 400_000,
    bRight: -100_000,
    aLeftExp: 100_000_000_027_179_122_688n,
    bLeftExp: -1_609_437_912_434_100_224n,
    aRightExp: 250_848_455_340_571_262_976n,
    bRightExp: 459_839_403_552_600_128n,
    safeFee: 100,
    capFee: 5_000,
  },

  // Tier 1: LIKE-ASSET.  safe +/-0.05% / alert->0.20% / danger->0.50% / cap 1.00%
  [PoolTier.LIKE_ASSET]: {
    safeLow: -350,
    safeHigh: 400,
    alertLow: -700,
    alertHigh: 1_200,
    dangerLow: -1_500,
    dangerHigh: 5_000,
    aLeft: -4_285_710,
    bLeft: -999_997,
    aRight: 1_875_000,
    bRight: -250_000,
    aLeftExp: 897_082_713_697_571_307_520n,
    bLeftExp: -1_145_363_414_842_693_888n,
    aRightExp: 1_497_492_754_575_049_359_360n,
    bRightExp: 241_129_139_966_882_912n,
    safeFee: 500,
    capFee: 10_000,
  },

  // Tier 2: BLUE-CHIP.  safe +/-0.30% / alert->2.00% / danger->5.00% / cap 5.50%
  [PoolTier.BLUE_CHIP]: {
    safeLow: -250,
    safeHigh: 334,
    alertLow: -500,
    alertHigh: 1_000,
    dangerLow: -1_000,
    dangerHigh: 5_000,
    aLeft: -68_000_000,
    bLeft: -14_000_000,
    aRight: 25_525_525,
    bRight: -5_525_525,
    aLeftExp: 8_000_000_001_237_896_396_800n,
    bLeftExp: -1_832_581_463_748_310_272n,
    aRightExp: 15_905_414_575_956_300_922_880n,
    bRightExp: 229_072_682_968_538_784n,
    safeFee: 3_000,
    capFee: 55_000,
  },

  // Tier 3: VOLATILE.  safe +/-0.50% / alert->3.00% / danger->7.50% / cap 9.00%
  [PoolTier.VOLATILE]: {
    safeLow: -150,
    safeHigh: 200,
    alertLow: -350,
    alertHigh: 600,
    dangerLow: -700,
    dangerHigh: 5_000,
    aLeft: -125_000_000,
    bLeft: -13_750_000,
    aRight: 62_500_000,
    bRight: -7_500_000,
    aLeftExp: 12_000_000_001_856_843_546_624n,
    bLeftExp: -2_617_973_519_640_443_392n,
    aRightExp: 26_476_264_318_162_022_957_056n,
    bRightExp: 208_247_893_607_762_528n,
    safeFee: 5_000,
    capFee: 90_000,
  },

  // Tier 4: EXOTIC.  safe +/-1.00% / alert->5.00% / danger->9.50% / cap 9.90%
  [PoolTier.EXOTIC]: {
    safeLow: -75,
    safeHigh: 100,
    alertLow: -200,
    alertHigh: 400,
    dangerLow: -500,
    dangerHigh: 5_000,
    aLeft: -320_000_000,
    bLeft: -14_000_000,
    aRight: 133_333_330,
    bRight: -3_333_332,
    aLeftExp: 32_593_745_518_938_709_557_248n,
    bLeftExp: -2_139_512_953_907_982_336n,
    aRightExp: 47_285_780_377_453_805_436_928n,
    bRightExp: 139_533_453_515_737_984n,
    safeFee: 10_000,
    capFee: 99_000,
  },
};

/** Curve parameters ordered by on-chain tier index (0..4). */
export const TIER_PARAMS_BY_INDEX: readonly SpryFeeParams[] = [
  TIER_PARAMS[PoolTier.STABLE],
  TIER_PARAMS[PoolTier.LIKE_ASSET],
  TIER_PARAMS[PoolTier.BLUE_CHIP],
  TIER_PARAMS[PoolTier.VOLATILE],
  TIER_PARAMS[PoolTier.EXOTIC],
];

/** Curve parameters for a tier. */
export function tierParams(tier: PoolTier): SpryFeeParams {
  return TIER_PARAMS[tier];
}
