// @spry/fee - tier table, cached on-chain tierParams, and a faithful JS
// four-zone fee curve.
//
// Mental model:
// - TIER vs DYNAMIC FEE are separate concepts. A tier (STABLE ... EXOTIC) is an
//   immutable bucket with a fixed base fee and cap fee. The dynamic fee is the
//   actual per-swap LP fee, which varies within those bounds per swap.
// - This package is for CHARTS and CLIENT-SIDE PREVIEW only. Execution pricing
//   always uses the V4Quoter. The curve here transcribes the on-chain math so
//   you can plot it and reason about fee headroom, not to size trades.

export * from './constants';
export * from './types';
export * from './tiers';
export * from './params';
export * from './curve';
export * from './reserves';
export * from './format';
export * from './sample';
