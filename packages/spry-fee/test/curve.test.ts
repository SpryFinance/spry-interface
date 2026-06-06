import { describe, it, expect } from 'vitest';
import {
  PoolTier,
  SpryZone,
  SpryDispatchCase,
  TIER_PARAMS,
  TIERS,
  feeForDelta,
  zoneOf,
  dispatchCase,
  marginalFee,
  feeIntegral,
  computeSignedDelta,
  virtualReservesFromState,
  feePipsToPercent,
  formatFeePercent,
  tierFromTickSpacing,
  type SpryFeeParams,
} from '../src/index';

// Expected curve landmarks per tier, transcribed from the contract's NatSpec
// (e.g. "safe +/-0.30% / alert->2.00% / danger->5.00% / cap 5.50%"). Linear
// (safe/alert) edges are integer-exact; the exponential danger edge is checked
// within a tolerance because it is evaluated with f64 `Math.exp`.
const EXPECTED: Record<PoolTier, { base: number; cap: number; alertEdge: number; dangerEdge: number }> = {
  [PoolTier.STABLE]: { base: 100, cap: 5_000, alertEdge: 500, dangerEdge: 2_500 },
  [PoolTier.LIKE_ASSET]: { base: 500, cap: 10_000, alertEdge: 2_000, dangerEdge: 5_000 },
  [PoolTier.BLUE_CHIP]: { base: 3_000, cap: 55_000, alertEdge: 20_000, dangerEdge: 50_000 },
  [PoolTier.VOLATILE]: { base: 5_000, cap: 90_000, alertEdge: 30_000, dangerEdge: 75_000 },
  [PoolTier.EXOTIC]: { base: 10_000, cap: 99_000, alertEdge: 50_000, dangerEdge: 95_000 },
};

const ALL_TIERS = Object.values(PoolTier);

describe('tier table', () => {
  it('matches base/cap fees and tick spacings', () => {
    expect(TIERS[PoolTier.STABLE].tickSpacing).toBe(1);
    expect(TIERS[PoolTier.LIKE_ASSET].tickSpacing).toBe(10);
    expect(TIERS[PoolTier.BLUE_CHIP].tickSpacing).toBe(60);
    expect(TIERS[PoolTier.VOLATILE].tickSpacing).toBe(200);
    expect(TIERS[PoolTier.EXOTIC].tickSpacing).toBe(1000);
    for (const tier of ALL_TIERS) {
      expect(TIERS[tier].baseFeePips).toBe(EXPECTED[tier].base);
      expect(TIERS[tier].capFeePips).toBe(EXPECTED[tier].cap);
      expect(TIER_PARAMS[tier].safeFee).toBe(EXPECTED[tier].base);
      expect(TIER_PARAMS[tier].capFee).toBe(EXPECTED[tier].cap);
    }
  });

  it('maps tick spacing -> tier and rejects invalid spacings', () => {
    expect(tierFromTickSpacing(60)).toBe(PoolTier.BLUE_CHIP);
    expect(() => tierFromTickSpacing(61)).toThrow();
  });
});

describe('feeForDelta (point curve)', () => {
  for (const tier of ALL_TIERS) {
    const p = TIER_PARAMS[tier];
    const e = EXPECTED[tier];

    it(`${tier}: safe zone returns base fee`, () => {
      expect(feeForDelta(0, p)).toBe(e.base);
      expect(feeForDelta(p.safeLow, p)).toBe(e.base); // linear edge, exact
      expect(feeForDelta(p.safeHigh, p)).toBe(e.base); // linear edge, exact
    });

    it(`${tier}: alert edges hit documented values exactly`, () => {
      expect(feeForDelta(p.alertLow, p)).toBe(e.alertEdge);
      expect(feeForDelta(p.alertHigh, p)).toBe(e.alertEdge);
    });

    it(`${tier}: danger edges land near documented values`, () => {
      const tol = Math.max(20, Math.round(e.dangerEdge * 0.01));
      expect(Math.abs(feeForDelta(p.dangerLow, p) - e.dangerEdge)).toBeLessThanOrEqual(tol);
      expect(Math.abs(feeForDelta(p.dangerHigh, p) - e.dangerEdge)).toBeLessThanOrEqual(tol);
    });

    it(`${tier}: beyond danger returns cap fee`, () => {
      expect(feeForDelta(p.dangerHigh + 1, p)).toBe(e.cap);
      expect(feeForDelta(p.dangerLow - 1, p)).toBe(e.cap);
      expect(feeForDelta(1_000_000, p)).toBe(e.cap);
    });

    it(`${tier}: fee is non-decreasing as |delta| grows on the right side`, () => {
      let prev = -1;
      for (let d = 0; d <= p.dangerHigh; d += Math.max(1, Math.floor(p.dangerHigh / 50))) {
        const fee = feeForDelta(d, p);
        expect(fee).toBeGreaterThanOrEqual(prev);
        prev = fee;
      }
    });
  }
});

describe('zoneOf', () => {
  const p = TIER_PARAMS[PoolTier.BLUE_CHIP];
  it('classifies each zone', () => {
    expect(zoneOf(0, p)).toBe(SpryZone.SAFE);
    expect(zoneOf(p.safeHigh + 1, p)).toBe(SpryZone.ALERT);
    expect(zoneOf(p.alertHigh + 1, p)).toBe(SpryZone.DANGER);
    expect(zoneOf(p.dangerHigh + 1, p)).toBe(SpryZone.CAP);
    expect(zoneOf(p.dangerLow - 1, p)).toBe(SpryZone.CAP);
  });
});

describe('dispatchCase', () => {
  it('labels growth / unwind / flip', () => {
    expect(dispatchCase(0, 0)).toBe(SpryDispatchCase.UNWIND);
    expect(dispatchCase(100, 500)).toBe(SpryDispatchCase.GROWTH);
    expect(dispatchCase(-100, -500)).toBe(SpryDispatchCase.GROWTH);
    expect(dispatchCase(500, 100)).toBe(SpryDispatchCase.UNWIND);
    expect(dispatchCase(-100, 300)).toBe(SpryDispatchCase.FLIP);
    expect(dispatchCase(300, -100)).toBe(SpryDispatchCase.FLIP);
  });
});

describe('marginalFee (integral mode)', () => {
  const p = TIER_PARAMS[PoolTier.BLUE_CHIP];

  it('zero move and unwind charge the base fee', () => {
    expect(marginalFee(123, 123, p)).toBe(p.safeFee);
    expect(marginalFee(800, 200, p)).toBe(p.safeFee); // same sign, shrinking
    expect(marginalFee(-800, -200, p)).toBe(p.safeFee);
  });

  it('growth wholly within the safe zone averages to the base fee', () => {
    expect(marginalFee(0, p.safeHigh, p)).toBe(p.safeFee);
  });

  it('growth into the alert/danger zone exceeds the base fee but stays under cap', () => {
    const fee = marginalFee(0, p.dangerHigh, p);
    expect(fee).toBeGreaterThan(p.safeFee);
    expect(fee).toBeLessThanOrEqual(p.capFee);
  });

  it('flip charges base over the unwind half', () => {
    // Pure unwind back to zero then a tiny growth -> close to base fee.
    const fee = marginalFee(-1000, 1, p);
    expect(fee).toBeGreaterThanOrEqual(p.safeFee);
    expect(fee).toBeLessThan(p.safeFee + 50);
  });
});

describe('feeIntegral (path independence)', () => {
  const p = TIER_PARAMS[PoolTier.BLUE_CHIP];

  it('is exactly additive within the safe zone', () => {
    const whole = feeIntegral(0, p.safeHigh, p, true);
    const split = feeIntegral(0, 100, p, true) + feeIntegral(100, p.safeHigh, p, true);
    expect(whole).toBe(split);
  });

  it('is additive across zones within rounding (telescoping integral)', () => {
    // Split point in the alert zone so the danger area is one identical call.
    const whole = feeIntegral(0, p.dangerHigh, p, true);
    const m = p.safeHigh + 200; // alert zone
    const split = feeIntegral(0, m, p, true) + feeIntegral(m, p.dangerHigh, p, true);
    const diff = whole > split ? whole - split : split - whole;
    expect(diff).toBeLessThanOrEqual(5n);
  });
});

describe('computeSignedDelta / virtualReservesFromState', () => {
  const Q96 = 1n << 96n;

  it('derives balanced reserves at price 1', () => {
    const { reserve0, reserve1 } = virtualReservesFromState(Q96, 1_000_000n);
    expect(reserve0).toBe(1_000_000n);
    expect(reserve1).toBe(1_000_000n);
  });

  it('signs delta by swap direction and reproduces the integer math', () => {
    const base = { sqrtPriceX96: Q96, liquidity: 1_000_000n };
    // zeroForOne exact-in: token1 leaves -> price down -> negative delta.
    expect(
      computeSignedDelta({ ...base, zeroForOne: true, amountSpecified: -100_000n }),
    ).toBe(-83n);
    // oneForZero exact-in: token0 leaves -> price up -> positive delta.
    expect(
      computeSignedDelta({ ...base, zeroForOne: false, amountSpecified: -100_000n }),
    ).toBe(90n);
  });

  it('returns 0 for degenerate inputs', () => {
    expect(computeSignedDelta({ sqrtPriceX96: Q96, liquidity: 0n, zeroForOne: true, amountSpecified: -1n })).toBe(0n);
    expect(computeSignedDelta({ sqrtPriceX96: Q96, liquidity: 1_000_000n, zeroForOne: true, amountSpecified: 0n })).toBe(0n);
  });
});

describe('formatting', () => {
  it('renders pips as percent', () => {
    expect(feePipsToPercent(3_000)).toBe(0.3);
    expect(formatFeePercent(3_000)).toBe('0.30%');
    expect(formatFeePercent(55_000)).toBe('5.50%');
    expect(formatFeePercent('500')).toBe('0.05%'); // subgraph strings
  });
});
