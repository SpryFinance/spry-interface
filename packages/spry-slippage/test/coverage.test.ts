import { describe, it, expect } from 'vitest';
import { PoolTier, TIERS } from '@spry/fee';
import {
  FeePolicy,
  amountOutMinExactIn,
  amountInMaxExactOut,
  protectExactIn,
  protectExactOut,
  protectExactOutForTier,
  resolveProtectionFeePips,
  impliedFeePipsExactOut,
} from '../src/index';

const PIPS = 1_000_000n;

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

// Ground-truth constant-product behaviour with the LP fee taken from the input
// (the v4 model the brief describes). These are independent of the package's
// formulas and used to validate them.
function cpOutAtFee(amountIn: bigint, rIn: bigint, rOut: bigint, feePips: number): bigint {
  const eff = (amountIn * (PIPS - BigInt(feePips))) / PIPS;
  return (eff * rOut) / (rIn + eff);
}
function cpInAtFee(amountOut: bigint, rIn: bigint, rOut: bigint, feePips: number): bigint {
  const eff = ceilDiv(amountOut * rIn, rOut - amountOut);
  return ceilDiv(eff * PIPS, PIPS - BigInt(feePips));
}

describe('bounds vs the true constant-product output (the core claim)', () => {
  const reserves: [bigint, bigint][] = [
    [10n ** 18n, 10n ** 18n],
    [10n ** 18n, 5n * 10n ** 18n],
    [2n ** 70n, 3n ** 44n],
  ];
  const feePairs: [number, number][] = [
    [3_000, 10_000],
    [3_000, 55_000],
    [500, 5_000],
    [5_000, 90_000],
    [100, 500_000],
  ];

  it('exact-in: amountOutMin is a conservative lower bound on the true output at f_max', () => {
    const violations: string[] = [];
    for (const [rIn, rOut] of reserves) {
      for (const sizeDiv of [1000n, 50n, 5n]) {
        const amountIn = rIn / sizeDiv;
        for (const [fNow, fMax] of feePairs) {
          const outNow = cpOutAtFee(amountIn, rIn, rOut, fNow);
          const outMax = cpOutAtFee(amountIn, rIn, rOut, fMax);
          const min = amountOutMinExactIn({ amountOut: outNow, feeNowPips: fNow, feeMaxPips: fMax, slippageBps: 0 });
          // Safety: never set the floor above what the user would actually get.
          if (min > outMax) violations.push(`min ${min} > trueOut ${outMax} (in=${amountIn}, f ${fNow}->${fMax})`);
          // Tightness for normal-sized swaps: within 1% of the true output.
          if (sizeDiv === 1000n && min < (outMax * 99n) / 100n) {
            violations.push(`loose: min ${min} vs trueOut ${outMax} (f ${fNow}->${fMax})`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('exact-out: amountInMax is a tight, safe upper bound on the true input at f_max', () => {
    const violations: string[] = [];
    for (const [rIn, rOut] of reserves) {
      for (const sizeDiv of [1000n, 50n, 5n]) {
        const amountOut = rOut / sizeDiv;
        for (const [fNow, fMax] of feePairs) {
          const inNow = cpInAtFee(amountOut, rIn, rOut, fNow);
          const inMax = cpInAtFee(amountOut, rIn, rOut, fMax);
          const max = amountInMaxExactOut({ amountIn: inNow, feeNowPips: fNow, feeMaxPips: fMax, slippageBps: 0 });
          // Safety: never set the cap below what is actually required.
          if (max < inMax) violations.push(`max ${max} < trueIn ${inMax} (out=${amountOut}, f ${fNow}->${fMax})`);
          // Tightness: exact up to a few units of integer rounding.
          if (max > inMax + 4n) violations.push(`loose: max ${max} vs trueIn ${inMax} (f ${fNow}->${fMax})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('rounding direction (revert safety)', () => {
  it('floors the min-out and ceils the max-in', () => {
    // 10001 * 9999/10000 = 9999.9999 -> floored to 9999 (a round-half would give 10000).
    expect(amountOutMinExactIn({ amountOut: 10_001n, feeNowPips: 0, feeMaxPips: 0, slippageBps: 1 })).toBe(9_999n);
    // 10001 * 10001/10000 = 10002.0001 -> ceiled to 10003 (a round-half would give 10002).
    expect(amountInMaxExactOut({ amountIn: 10_001n, feeNowPips: 0, feeMaxPips: 0, slippageBps: 1 })).toBe(10_003n);
  });

  it('returns zero for zero amounts', () => {
    expect(amountOutMinExactIn({ amountOut: 0n, feeNowPips: 3_000, feeMaxPips: 50_000, slippageBps: 50 })).toBe(0n);
    expect(amountInMaxExactOut({ amountIn: 0n, feeNowPips: 3_000, feeMaxPips: 50_000, slippageBps: 50 })).toBe(0n);
  });
});

describe('protectExactOut symmetry', () => {
  const amountIn = 1_000_000_000_000_000_000n;
  const feeNowPips = 4_200;
  const cap = TIERS[PoolTier.BLUE_CHIP].capFeePips;

  it('reports the fee it sized against and respects the default policy', () => {
    const r = protectExactOut({ amountIn, feeNowPips, capFeePips: cap });
    expect(r.feeMaxPips).toBe(feeNowPips + Math.round((cap - feeNowPips) * 0.5));
    expect(r.slippageBps).toBe(50);
    expect(r.amountInMax).toBeGreaterThan(amountIn);
  });

  it('worst-case requires more input than bounded', () => {
    const bounded = protectExactOut({ amountIn, feeNowPips, capFeePips: cap });
    const worst = protectExactOut({
      amountIn,
      feeNowPips,
      capFeePips: cap,
      protection: { slippageBps: 50, fee: { policy: FeePolicy.WORST_CASE } },
    });
    expect(worst.amountInMax).toBeGreaterThan(bounded.amountInMax);
  });

  it('as-quoted reflects price slippage only', () => {
    const asQuoted = protectExactOut({
      amountIn,
      feeNowPips,
      capFeePips: cap,
      protection: { slippageBps: 50, fee: { policy: FeePolicy.AS_QUOTED } },
    });
    expect(asQuoted.feeMaxPips).toBe(feeNowPips);
  });

  it('the tier convenience matches the explicit cap', () => {
    expect(protectExactOutForTier(PoolTier.BLUE_CHIP, { amountIn, feeNowPips })).toEqual(
      protectExactOut({ amountIn, feeNowPips, capFeePips: cap }),
    );
  });
});

describe('policy edges', () => {
  const now = 4_200;
  const cap = 55_000;

  it('headroom fraction 0 -> current fee, 1 -> cap', () => {
    expect(resolveProtectionFeePips({ policy: FeePolicy.BOUNDED, headroomFraction: 0 }, now, cap)).toBe(now);
    expect(resolveProtectionFeePips({ policy: FeePolicy.BOUNDED, headroomFraction: 1 }, now, cap)).toBe(cap);
  });

  it('tolerancePips wins when both it and headroomFraction are set', () => {
    expect(
      resolveProtectionFeePips({ policy: FeePolicy.BOUNDED, tolerancePips: 1_000, headroomFraction: 1 }, now, cap),
    ).toBe(5_200);
  });

  it('rejects invalid implied-fee exact-out inputs', () => {
    expect(() => impliedFeePipsExactOut(1_000n, 1_001n)).toThrow(); // grossIn > netIn
    expect(() => impliedFeePipsExactOut(0n, 0n)).toThrow(); // netIn <= 0
  });
});
