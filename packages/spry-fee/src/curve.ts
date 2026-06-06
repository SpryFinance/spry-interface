// A faithful JavaScript port of `SmartFeeLib` (the four-zone curve and the
// integral-mode marginal fee).
//
// ============================ READ THIS ============================
// FOR CHARTS AND CLIENT-SIDE PREVIEW ONLY. Never price a real trade with this:
// execution pricing ALWAYS goes through the `V4Quoter`, which routes through
// `PoolManager` -> `SpryHook.beforeSwap` and returns exactly what a swap would
// do at that block. This module exists to draw the fee curve, place the live
// marker, and reason about how high the fee can rise within a window (the
// slippage / fee-headroom model).
// ===================================================================
//
// Precision: the safe / alert / cap arithmetic uses BigInt and reproduces
// Solidity's integer truncation exactly. The danger zone is an exponential
// (`a * e^(b*delta/1000)`); on-chain it is evaluated with PRB-Math SD59x18,
// here with f64 `Math.exp`. The two agree to within ~1 pip across the danger
// zone, which is immaterial for charts and previews. When you need the exact
// on-chain value, read `tierParams` (this transcribes them) or the Quoter.

import type { SpryFeeParams } from './types';
import { SpryZone, SpryDispatchCase } from './types';

const ONE_E18 = 10n ** 18n;
const ONE_E36 = 10n ** 36n;

type IntLike = number | bigint;

function toBigInt(value: IntLike): bigint {
  return typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

// --- point evaluation: fee at a single delta -----------------------------

/**
 * `e^(argFixed / 1e18)` returned as a 1e18-fixed-point BigInt, mirroring
 * `unwrap(E.pow(wrap(argFixed)))`. Approximated with f64 `Math.exp` (see the
 * module header). Danger-zone arguments stay in single digits, so there is no
 * overflow risk.
 */
function expFixed(argFixed: bigint): bigint {
  const real = Number(argFixed) / 1e18;
  return BigInt(Math.round(Math.exp(real) * 1e18));
}

/** Linear (alert-zone) point rate: `(a*delta + 1000*b) / 1_000_000`, truncated. */
function linear(a: number, b: number, delta: number): number {
  const raw = BigInt(a) * BigInt(delta) + 1000n * BigInt(b);
  return Number(raw / 1_000_000n);
}

/** Exponential (danger-zone) point rate: `(a * e^(b*delta/1000)) / 1e36`, truncated. */
function exp(a: bigint, b: bigint, delta: number): number {
  const expArg = (b * BigInt(delta)) / 1000n;
  const expVal = expFixed(expArg);
  return Number((a * expVal) / ONE_E36);
}

/**
 * The four-zone fee curve evaluated at a single signed `delta` (per-mille of
 * reserve shift). Returns the point fee in pips. This is the curve you plot;
 * it is NOT what a swap pays (that is the integral-mode {@link marginalFee}).
 */
export function feeForDelta(delta: IntLike, p: SpryFeeParams): number {
  const d = Number(toBigInt(delta));
  if (d === 0) return p.safeFee;
  if (d >= p.safeLow && d <= p.safeHigh) return p.safeFee;
  if (d >= p.alertLow && d < p.safeLow) return linear(p.aLeft, p.bLeft, d);
  if (d > p.safeHigh && d <= p.alertHigh) return linear(p.aRight, p.bRight, d);
  if (d >= p.dangerLow && d < p.alertLow) return exp(p.aLeftExp, p.bLeftExp, d);
  if (d > p.alertHigh && d <= p.dangerHigh) return exp(p.aRightExp, p.bRightExp, d);
  return p.capFee;
}

/** The fee-curve zone a signed (cumulative) delta falls in. Mirrors `zoneOf`. */
export function zoneOf(cum: IntLike, p: SpryFeeParams): SpryZone {
  const c = toBigInt(cum);
  const safeLow = BigInt(p.safeLow);
  const safeHigh = BigInt(p.safeHigh);
  const alertLow = BigInt(p.alertLow);
  const alertHigh = BigInt(p.alertHigh);
  const dangerLow = BigInt(p.dangerLow);
  const dangerHigh = BigInt(p.dangerHigh);
  if (c >= safeLow && c <= safeHigh) return SpryZone.SAFE;
  if ((c >= alertLow && c < safeLow) || (c > safeHigh && c <= alertHigh)) return SpryZone.ALERT;
  if ((c >= dangerLow && c < alertLow) || (c > alertHigh && c <= dangerHigh)) return SpryZone.DANGER;
  return SpryZone.CAP;
}

// --- integral mode: the fee a swap actually pays --------------------------

/**
 * Antiderivative of the linear alert-zone curve over magnitudes [y0, y1] on one
 * side. Returns area in pips*delta (BigInt, integer-exact). Mirrors `_alertArea`.
 */
function alertArea(y0: bigint, y1: bigint, p: SpryFeeParams, right: boolean): bigint {
  let a: bigint;
  let b: bigint;
  if (right) {
    a = BigInt(p.aRight);
    b = BigInt(p.bRight);
  } else {
    a = BigInt(-p.aLeft); // aLeft is negative -> a is positive
    b = BigInt(p.bLeft); // bLeft is negative -> keep as is
  }
  const raw = (a * (y1 * y1 - y0 * y0)) / 2n + 1000n * b * (y1 - y0);
  return raw / 1_000_000n;
}

/**
 * Antiderivative of the exponential danger-zone curve over magnitudes [y0, y1]
 * on one side. Returns area in pips*delta (BigInt; exp via f64). Mirrors
 * `_dangerArea`.
 */
function dangerArea(y0: bigint, y1: bigint, p: SpryFeeParams, right: boolean): bigint {
  if (y0 === y1) return 0n;
  const aExp = right ? p.aRightExp : p.aLeftExp;
  const bExp = right ? p.bRightExp : p.bLeftExp;

  const d0Signed = right ? y0 : -y0;
  const d1Signed = right ? y1 : -y1;

  const expArg0 = (bExp * d0Signed) / 1000n;
  const expArg1 = (bExp * d1Signed) / 1000n;

  const diff = expFixed(expArg1) - expFixed(expArg0);
  const area = (aExp * 1000n * diff) / (bExp * ONE_E18);
  return abs(area);
}

/**
 * Definite integral of the fee curve over magnitudes [y0, y1] on one side
 * (`right == true` for positive deltas, `false` for negative). Stitches across
 * the safe -> alert -> danger -> cap zones. Returns area in pips*delta.
 * Mirrors `_integral`.
 *
 * Exposed because it is the exact, path-independent cumulative cost: the fee
 * for moving a pool's cumulative from |y0| to |y1| on one side is
 * `feeIntegral(y0, y1, p, right) / (y1 - y0)`. Useful for the "how much could
 * this cost" reasoning behind the fee-headroom model.
 */
export function feeIntegral(y0: IntLike, y1: IntLike, p: SpryFeeParams, right: boolean): bigint {
  let lo = toBigInt(y0);
  const hi = toBigInt(y1);
  if (lo === hi) return 0n;
  if (lo > hi) throw new RangeError('feeIntegral requires y0 <= y1');

  const safeEnd = BigInt(right ? p.safeHigh : -p.safeLow);
  const alertEnd = BigInt(right ? p.alertHigh : -p.alertLow);
  const dangerEnd = BigInt(right ? p.dangerHigh : -p.dangerLow);

  let area = 0n;

  // Safe zone [0, safeEnd]: constant safeFee.
  if (lo < safeEnd) {
    const end = hi < safeEnd ? hi : safeEnd;
    area += BigInt(p.safeFee) * (end - lo);
    if (end === hi) return area;
    lo = end;
  }

  // Alert zone (safeEnd, alertEnd]: linear curve.
  if (lo < alertEnd) {
    const end = hi < alertEnd ? hi : alertEnd;
    area += alertArea(lo, end, p, right);
    if (end === hi) return area;
    lo = end;
  }

  // Danger zone (alertEnd, dangerEnd]: exponential curve.
  if (lo < dangerEnd) {
    const end = hi < dangerEnd ? hi : dangerEnd;
    area += dangerArea(lo, end, p, right);
    if (end === hi) return area;
    lo = end;
  }

  // Cap zone (dangerEnd, infinity): constant capFee.
  area += BigInt(p.capFee) * (hi - lo);
  return area;
}

/**
 * Path-independent average fee (in pips) for a swap that shifts the pool's
 * block-windowed cumulative from `cumBefore` to `cumAfter`. This is the fee the
 * hook actually charges. Mirrors `marginalFee`.
 *
 * Three cases:
 * - GROWTH (same sign, |after| > |before|): integral average over the interval.
 * - UNWIND (same sign, |after| <= |before|): the tier base fee.
 * - FLIP (opposite signs): base fee over the unwind half, integral over the
 *   growth half, weighted by magnitude.
 *
 * Preview only: the authoritative live fee is the Quoter's implied fee.
 */
export function marginalFee(cumBefore: IntLike, cumAfter: IntLike, p: SpryFeeParams): number {
  const before = toBigInt(cumBefore);
  const after = toBigInt(cumAfter);
  if (before === after) return p.safeFee;

  const absBefore = abs(before);
  const absAfter = abs(after);
  const flipped = (before > 0n && after < 0n) || (before < 0n && after > 0n);

  if (!flipped) {
    if (absAfter > absBefore) {
      // GROWTH.
      const right = after > 0n || before > 0n;
      const area = feeIntegral(absBefore, absAfter, p, right);
      return Number(area / (absAfter - absBefore));
    }
    // UNWIND.
    return p.safeFee;
  }

  // FLIP.
  const rightAfter = after > 0n;
  const areaGrowth = feeIntegral(0n, absAfter, p, rightAfter);
  const areaUnwind = BigInt(p.safeFee) * absBefore;
  return Number((areaUnwind + areaGrowth) / (absBefore + absAfter));
}

/** The integral-mode dispatch case for a cumulative move. Mirrors `dispatchCase`. */
export function dispatchCase(cumBefore: IntLike, cumAfter: IntLike): SpryDispatchCase {
  const before = toBigInt(cumBefore);
  const after = toBigInt(cumAfter);
  if (before === after) return SpryDispatchCase.UNWIND;
  const flipped = (before > 0n && after < 0n) || (before < 0n && after > 0n);
  if (flipped) return SpryDispatchCase.FLIP;
  return abs(after) > abs(before) ? SpryDispatchCase.GROWTH : SpryDispatchCase.UNWIND;
}
