// Sampling the point fee curve for plotting (the fee-curve chart widget).
//
// Returns the point fee `feeForDelta` across a delta range; this is the static
// curve shape. Overlay a live marker at the pool's current cumulative
// (`poolWindow.signedCum` on-chain, or `Pool.lastCum` from the subgraph).

import type { PoolTier, SpryFeeParams, SpryZone } from './types';
import { TIER_PARAMS } from './params';
import { feeForDelta, zoneOf } from './curve';

/** One point on the fee curve. */
export interface CurveSample {
  /** Signed per-mille reserve shift. */
  delta: number;
  /** Point fee in pips. */
  feePips: number;
  /** Zone the delta falls in. */
  zone: SpryZone;
}

/** Options for {@link sampleFeeCurve}. */
export interface SampleOptions {
  /** Lowest delta to sample. Default: dangerLow rounded outward by 20%. */
  from?: number;
  /** Highest delta to sample. Default: dangerHigh rounded outward by 20%. */
  to?: number;
  /** Number of points (inclusive of both ends). Default 240. */
  points?: number;
}

function sampleParams(p: SpryFeeParams, opts: SampleOptions = {}): CurveSample[] {
  const from = opts.from ?? Math.floor(p.dangerLow * 1.2);
  const to = opts.to ?? Math.ceil(p.dangerHigh * 1.2);
  const points = Math.max(2, opts.points ?? 240);
  if (to <= from) throw new RangeError('sampleFeeCurve requires to > from');

  const step = (to - from) / (points - 1);
  const out: CurveSample[] = [];
  for (let i = 0; i < points; i++) {
    const delta = Math.round(from + step * i);
    out.push({ delta, feePips: feeForDelta(delta, p), zone: zoneOf(delta, p) });
  }
  return out;
}

/** Sample the point fee curve for a tier, for charting. */
export function sampleFeeCurve(tier: PoolTier, opts?: SampleOptions): CurveSample[] {
  return sampleParams(TIER_PARAMS[tier], opts);
}
