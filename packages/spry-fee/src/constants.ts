// Protocol-level constants for Spry's dynamic fee.
//
// Fees everywhere in Spry are expressed in V4 "pips": 1_000_000 pips == 100%.
// (So 3_000 pips == 0.30%, 100 pips == 0.01%.) See `./format` for rendering.

/**
 * V4's dynamic-fee sentinel. Every Spry pool sets `PoolKey.fee` to exactly
 * this value (`LPFeeLibrary.DYNAMIC_FEE_FLAG`). It is NOT a fee amount: never
 * render `0x800000` / `8_388_608` as a number. The effective fee always comes
 * from the Quoter, the `SpryFee` event, or the subgraph.
 */
export const DYNAMIC_FEE_FLAG = 0x800000; // 8_388_608

/**
 * V4's `LPFeeLibrary.OVERRIDE_FEE_FLAG`. The hook OR-s this into the fee it
 * returns from `beforeSwap`; V4 core strips it before applying. The clean
 * per-swap fee (as seen in the `SpryFee` event and the subgraph) never carries
 * it. Exposed only so off-chain code can strip it from a raw return value.
 */
export const OVERRIDE_FEE_FLAG = 0x400000; // 4_194_304

/** Pip denominator: 1_000_000 pips == 100%. */
export const PIPS_DENOMINATOR = 1_000_000;

/**
 * The five sanctioned tick spacings, one per tier. A Spry pool MUST use one of
 * these; any other tick spacing reverts on the first swap (`InvalidTier`).
 */
export const VALID_TICK_SPACINGS = [1, 10, 60, 200, 1000] as const;

/** Number of tiers (mirrors `SpryHook.TIER_COUNT`). */
export const TIER_COUNT = 5;
