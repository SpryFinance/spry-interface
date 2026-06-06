// Fee rendering helpers.
//
// Fees are pips: 1_000_000 pips == 100%, so percent = pips / 10_000 and the
// fraction = pips / 1_000_000. All helpers accept `number | bigint | string`
// because GraphQL `BigInt`/`BigDecimal` values arrive from the subgraph as
// strings. Prefer a subgraph-provided `feePercent` when one is available; these
// are the fallback the brief specifies.

import { PIPS_DENOMINATOR } from './constants';

type PipLike = number | bigint | string;

function toNumber(pips: PipLike): number {
  if (typeof pips === 'number') return pips;
  if (typeof pips === 'bigint') return Number(pips);
  const n = Number(pips);
  if (Number.isNaN(n)) throw new TypeError(`not a numeric pip value: ${pips}`);
  return n;
}

/** Pips as a fraction of 1 (e.g. 3000 -> 0.003). */
export function feePipsToFraction(pips: PipLike): number {
  return toNumber(pips) / PIPS_DENOMINATOR;
}

/** Pips as a percent value (e.g. 3000 -> 0.3, meaning 0.30%). */
export function feePipsToPercent(pips: PipLike): number {
  return toNumber(pips) / 10_000;
}

/** Pips as basis points (e.g. 3000 -> 30 bps). */
export function feePipsToBps(pips: PipLike): number {
  return toNumber(pips) / 100;
}

/** Render pips as a percent string, e.g. 3000 -> "0.30%". */
export function formatFeePercent(pips: PipLike, fractionDigits = 2): string {
  return `${feePipsToPercent(pips).toFixed(fractionDigits)}%`;
}

/**
 * Render a fee range as a percent string, e.g. "0.30% - 5.50%". Collapses to a
 * single value when min == max.
 */
export function formatFeeRange(minPips: PipLike, maxPips: PipLike, fractionDigits = 2): string {
  const lo = feePipsToPercent(minPips);
  const hi = feePipsToPercent(maxPips);
  if (lo === hi) return `${lo.toFixed(fractionDigits)}%`;
  return `${lo.toFixed(fractionDigits)}% - ${hi.toFixed(fractionDigits)}%`;
}

/** Basis points -> pips (1 bp == 100 pips). */
export function bpsToPips(bps: number): number {
  return Math.round(bps * 100);
}

/** Percent value -> pips (e.g. 0.3 -> 3000). */
export function percentToPips(percent: number): number {
  return Math.round(percent * 10_000);
}
