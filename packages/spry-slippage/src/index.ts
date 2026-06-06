// @spry/slippage - dynamic-fee-aware slippage (brief section 7).
//
// Upstream slippage only protects against price movement. On Spry the LP fee is
// dynamic and can rise within a block window (other swaps push the cumulative
// toward danger), so the quoted fee is a lower bound. Protection here is the SUM
// of two buffers: price slippage AND fee headroom (the fee rising from the
// quoted value toward the tier cap). Sizing/preview only; swaps execute through
// the router and the live price/fee come from the V4Quoter.

export * from './types';
export * from './fee';
export * from './protect';
