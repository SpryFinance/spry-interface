import { describe, it, expect } from 'vitest';
import {
  PoolTier,
  SpryZone,
  SpryDispatchCase,
  ZONE_BY_INDEX,
  DISPATCH_CASE_BY_INDEX,
  ZONE_INDEX,
  DISPATCH_CASE_INDEX,
  zoneFromIndex,
  dispatchCaseFromIndex,
  tierFromIndex,
  tickSpacingForTier,
  tierFromTickSpacing,
  TIER_PARAMS,
  TIERS,
  feeForDelta,
  marginalFee,
  feeIntegral,
  computeSignedDelta,
  virtualReservesFromState,
  sampleFeeCurve,
  formatFeeRange,
  bpsToPips,
  percentToPips,
  feePipsToBps,
} from '../src/index';

const Q96 = 1n << 96n;
const BLUE = TIER_PARAMS[PoolTier.BLUE_CHIP];

// The positive side is covered in curve.test.ts. The negative (left) side uses
// different coefficients, bounds, and sign handling, so it gets its own checks.
describe('left (negative) side of the curve', () => {
  it('feeForDelta hits left edges (linear exact, exp at the danger edge)', () => {
    expect(feeForDelta(BLUE.safeLow, BLUE)).toBe(BLUE.safeFee); // safe edge
    expect(feeForDelta(BLUE.alertLow, BLUE)).toBe(20_000); // alert edge, exact
    expect(feeForDelta(BLUE.dangerLow, BLUE)).toBe(50_000); // danger edge
    expect(feeForDelta(BLUE.dangerLow - 1, BLUE)).toBe(BLUE.capFee); // cap
  });

  it('marginalFee grows on the left and respects bounds', () => {
    expect(marginalFee(0, BLUE.safeLow, BLUE)).toBe(BLUE.safeFee); // growth within safe
    const intoDanger = marginalFee(0, BLUE.dangerLow, BLUE);
    const intoAlert = marginalFee(0, BLUE.alertLow, BLUE);
    expect(intoAlert).toBeGreaterThan(BLUE.safeFee);
    expect(intoDanger).toBeGreaterThan(intoAlert); // further out -> higher average
    expect(intoDanger).toBeLessThanOrEqual(BLUE.capFee);
  });

  it('is asymmetric: same |move| costs differently on each side', () => {
    // +600 lands in the alert zone, -600 in the (steeper) danger zone.
    expect(marginalFee(0, -600, BLUE)).toBeGreaterThan(marginalFee(0, 600, BLUE));
  });

  it('feeIntegral is additive on the left side within rounding', () => {
    const whole = feeIntegral(0, 1000, BLUE, false);
    const split = feeIntegral(0, 300, BLUE, false) + feeIntegral(300, 1000, BLUE, false);
    const diff = whole > split ? whole - split : split - whole;
    expect(diff).toBeLessThanOrEqual(5n);
  });
});

describe('computeSignedDelta: exact-out and non-unit price', () => {
  const base = { sqrtPriceX96: Q96, liquidity: 1_000_000n };

  it('handles exact-out swaps (positive amountSpecified)', () => {
    // zeroForOne exact-out: token1 leaves -> price down -> negative delta.
    expect(computeSignedDelta({ ...base, zeroForOne: true, amountSpecified: 100_000n })).toBe(-90n);
    // oneForZero exact-out: token0 leaves -> price up -> positive delta.
    expect(computeSignedDelta({ ...base, zeroForOne: false, amountSpecified: 100_000n })).toBe(100n);
  });

  it('derives asymmetric reserves at a non-unit price', () => {
    // sqrtPriceX96 = 2*Q96 -> price 4 -> reserve1 = 4*reserve0.
    const { reserve0, reserve1 } = virtualReservesFromState(2n * Q96, 1_000_000n);
    expect(reserve0).toBe(500_000n);
    expect(reserve1).toBe(2_000_000n);
    const delta = computeSignedDelta({
      sqrtPriceX96: 2n * Q96,
      liquidity: 1_000_000n,
      zeroForOne: true,
      amountSpecified: -100_000n,
    });
    expect(delta).toBeLessThan(0n);
  });
});

describe('enum / index decoders', () => {
  it('round-trips zones and dispatch cases', () => {
    ZONE_BY_INDEX.forEach((zone, i) => {
      expect(zoneFromIndex(i)).toBe(zone);
      expect(ZONE_INDEX[zone]).toBe(i);
    });
    DISPATCH_CASE_BY_INDEX.forEach((dc, i) => {
      expect(dispatchCaseFromIndex(i)).toBe(dc);
      expect(DISPATCH_CASE_INDEX[dc]).toBe(i);
    });
    expect(zoneFromIndex(2)).toBe(SpryZone.DANGER);
    expect(dispatchCaseFromIndex(2)).toBe(SpryDispatchCase.FLIP);
    expect(() => zoneFromIndex(4)).toThrow();
    expect(() => dispatchCaseFromIndex(3)).toThrow();
  });

  it('round-trips tiers and tick spacings', () => {
    expect(tierFromIndex(2)).toBe(PoolTier.BLUE_CHIP);
    expect(TIERS[PoolTier.BLUE_CHIP].index).toBe(2);
    expect(tickSpacingForTier(tierFromTickSpacing(60))).toBe(60);
    expect(() => tierFromIndex(5)).toThrow();
  });
});

describe('sampleFeeCurve', () => {
  it('returns ascending points spanning safe through cap', () => {
    const samples = sampleFeeCurve(PoolTier.BLUE_CHIP, { points: 50 });
    expect(samples).toHaveLength(50);
    samples.reduce((prev, s) => {
      expect(s.delta).toBeGreaterThanOrEqual(prev);
      return s.delta;
    }, -Infinity);
    const zones = new Set(samples.map((s) => s.zone));
    expect(zones.has(SpryZone.SAFE)).toBe(true);
    expect(zones.has(SpryZone.CAP)).toBe(true);
    expect(samples.every((s) => s.feePips >= BLUE.safeFee && s.feePips <= BLUE.capFee)).toBe(true);
  });

  it('throws when the range is empty', () => {
    expect(() => sampleFeeCurve(PoolTier.BLUE_CHIP, { from: 10, to: 10 })).toThrow();
  });
});

describe('formatting helpers', () => {
  it('renders ranges and converts units', () => {
    expect(formatFeeRange(3_000, 55_000)).toBe('0.30% - 5.50%');
    expect(formatFeeRange(3_000, 3_000)).toBe('0.30%'); // collapses
    expect(bpsToPips(30)).toBe(3_000);
    expect(percentToPips(0.3)).toBe(3_000);
    expect(feePipsToBps(3_000)).toBe(30);
  });
});
