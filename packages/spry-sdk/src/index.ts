// @spry/sdk - Spry contract SDK.
//
// - SpryRouter calldata builders: the 8 swap entry points (single/multi,
//   exact-in/out, allowance/Permit2) plus multicall + permit batching, each
//   returning a ready-to-send { to, data, value } with the brief section 6.1
//   guards enforced. Size the min/max limits with @spry/slippage; price with
//   the V4Quoter.
// - SpryHook views client: cached BLOCK_WINDOW / tierParams, live poolWindow,
//   and the window countdown.
// - PoolKey helpers: spryPoolKey + the v4 poolId.

export * from './abi';
export * from './types';
export * from './guards';
export * from './keys';
export * from './router';
export * from './hook';
