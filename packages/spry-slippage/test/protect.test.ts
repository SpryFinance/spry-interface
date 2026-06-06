import { describe, it, expect } from 'vitest';
import { PoolTier, TIERS } from '@spry/fee';
import {
  FeePolicy,
  DEFAULT_PROTECTION,
  DEFAULT_FEE_PROTECTION,
  resolveProtectionFeePips,
  impliedFeePipsExactIn,
  impliedFeePipsExactOut,
  amountOutMinExactIn,
  amountInMaxExactOut,
  protectExactIn,
  protectExactOut,
  protectExactInForTier,
} from '../src/index';

describe('resolveProtectionFeePips', () => {
  const cap = 55_000; // blue-chip
  const now = 4_200; // 0.42%

  it('handles the three policies', () => {
    expect(resolveProtectionFeePips({ policy: FeePolicy.AS_QUOTED }, now, cap)).toBe(now);
    expect(resolveProtectionFeePips({ policy: FeePolicy.WORST_CASE }, now, cap)).toBe(cap);
    expect(resolveProtectionFeePips({ policy: FeePolicy.BOUNDED, headroomFraction: 0.5 }, now, cap)).toBe(
      now + Math.round((cap - now) * 0.5),
    );
    expect(resolveProtectionFeePips({ policy: FeePolicy.BOUNDED, tolerancePips: 1_000 }, now, cap)).toBe(5_200);
  });

  it('clamps bounded headroom to the cap and never below the current fee', () => {
    expect(resolveProtectionFeePips({ policy: FeePolicy.BOUNDED, tolerancePips: 10_000_000 }, now, cap)).toBe(cap);
    expect(resolveProtectionFeePips({ policy: FeePolicy.BOUNDED, tolerancePips: 0 }, now, cap)).toBe(now);
  });

  it('rejects feeNow above cap', () => {
    expect(() => resolveProtectionFeePips({ policy: FeePolicy.WORST_CASE }, 60_000, cap)).toThrow();
  });

  it('default protection is bounded at half the headroom, 0.50% slippage', () => {
    expect(DEFAULT_FEE_PROTECTION.policy).toBe(FeePolicy.BOUNDED);
    expect(DEFAULT_PROTECTION.slippageBps).toBe(50);
  });
});

describe('impliedFeePips', () => {
  it('derives the fee from gross/net (brief 5.1)', () => {
    expect(impliedFeePipsExactIn(1_000n, 997n)).toBe(3_000); // 0.30%
    expect(impliedFeePipsExactOut(1_003n, 1_000n)).toBe(2_991);
    expect(() => impliedFeePipsExactIn(0n, 0n)).toThrow();
    expect(() => impliedFeePipsExactIn(1_000n, 1_001n)).toThrow();
  });
});

describe('amountOutMinExactIn', () => {
  it('is identity with no fee rise and no slippage', () => {
    expect(amountOutMinExactIn({ amountOut: 1_000_000n, feeNowPips: 3_000, feeMaxPips: 3_000, slippageBps: 0 })).toBe(
      1_000_000n,
    );
  });

  it('applies price slippage by flooring', () => {
    expect(amountOutMinExactIn({ amountOut: 1_000_000n, feeNowPips: 0, feeMaxPips: 0, slippageBps: 100 })).toBe(
      990_000n, // 1% off
    );
  });

  it('applies fee headroom (50% fee halves the output basis)', () => {
    expect(amountOutMinExactIn({ amountOut: 1_000_000n, feeNowPips: 0, feeMaxPips: 500_000, slippageBps: 0 })).toBe(
      500_000n,
    );
  });

  it('is monotonic: a higher protection fee lowers the min', () => {
    const lo = amountOutMinExactIn({ amountOut: 1_000_000n, feeNowPips: 3_000, feeMaxPips: 10_000, slippageBps: 50 });
    const hi = amountOutMinExactIn({ amountOut: 1_000_000n, feeNowPips: 3_000, feeMaxPips: 40_000, slippageBps: 50 });
    expect(hi).toBeLessThan(lo);
  });

  it('rejects feeMax below feeNow', () => {
    expect(() => amountOutMinExactIn({ amountOut: 1n, feeNowPips: 5_000, feeMaxPips: 3_000, slippageBps: 0 })).toThrow();
    expect(() => amountOutMinExactIn({ amountOut: 1n, feeNowPips: 0, feeMaxPips: 0, slippageBps: 10_000 })).toThrow();
  });
});

describe('amountInMaxExactOut', () => {
  it('is identity with no fee rise and no slippage', () => {
    expect(amountInMaxExactOut({ amountIn: 1_000_000n, feeNowPips: 3_000, feeMaxPips: 3_000, slippageBps: 0 })).toBe(
      1_000_000n,
    );
  });

  it('applies price slippage by ceiling upward', () => {
    expect(amountInMaxExactOut({ amountIn: 1_000_000n, feeNowPips: 0, feeMaxPips: 0, slippageBps: 100 })).toBe(
      1_010_000n, // 1% more
    );
  });

  it('fee headroom is exact: 50% fee doubles the required input', () => {
    expect(amountInMaxExactOut({ amountIn: 1_000_000n, feeNowPips: 0, feeMaxPips: 500_000, slippageBps: 0 })).toBe(
      2_000_000n,
    );
  });

  it('is monotonic: a higher protection fee raises the max', () => {
    const lo = amountInMaxExactOut({ amountIn: 1_000_000n, feeNowPips: 3_000, feeMaxPips: 10_000, slippageBps: 50 });
    const hi = amountInMaxExactOut({ amountIn: 1_000_000n, feeNowPips: 3_000, feeMaxPips: 40_000, slippageBps: 50 });
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('high-level protect', () => {
  const amountOut = 1_000_000_000_000_000_000n; // 1e18
  const feeNowPips = 4_200;
  const cap = TIERS[PoolTier.BLUE_CHIP].capFeePips; // 55_000

  it('protectExactIn uses default policy and reports the fee it sized against', () => {
    const r = protectExactIn({ amountOut, feeNowPips, capFeePips: cap });
    expect(r.feeMaxPips).toBe(feeNowPips + Math.round((cap - feeNowPips) * 0.5)); // 29_600
    expect(r.slippageBps).toBe(50);
    expect(r.amountOutMin).toBeLessThan(amountOut);
    expect(r.amountOutMin).toBeGreaterThan((amountOut * 9n) / 10n); // sane (<10% total)
  });

  it('worst-case protects more than bounded (lower min)', () => {
    const bounded = protectExactIn({ amountOut, feeNowPips, capFeePips: cap });
    const worst = protectExactIn({
      amountOut,
      feeNowPips,
      capFeePips: cap,
      protection: { slippageBps: 50, fee: { policy: FeePolicy.WORST_CASE } },
    });
    expect(worst.feeMaxPips).toBe(cap);
    expect(worst.amountOutMin).toBeLessThan(bounded.amountOutMin);
  });

  it('the tier convenience looks up the cap', () => {
    const viaTier = protectExactInForTier(PoolTier.BLUE_CHIP, { amountOut, feeNowPips });
    const explicit = protectExactIn({ amountOut, feeNowPips, capFeePips: cap });
    expect(viaTier).toEqual(explicit);
  });

  it('protectExactOut produces a max above the quote', () => {
    const r = protectExactOut({ amountIn: amountOut, feeNowPips, capFeePips: cap });
    expect(r.amountInMax).toBeGreaterThan(amountOut);
  });
});
