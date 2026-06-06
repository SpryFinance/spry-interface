// (sqrtPriceX96, liquidity) -> virtual reserves -> a swap's signed delta.
//
// Faithful BigInt port of `VirtualReserves` + `SmartFeeLib.computeSignedDelta`.
// BigInt is exact and has no overflow, so the FullMath.mulDiv calls reduce to
// plain `(a * b) / c` floor division.
//
// PREVIEW ONLY (it derives the same `delta` the curve consumes). Real swaps are
// priced by the Quoter.

const Q96 = 1n << 96n;

/** Virtual reserves for a full-range pool's local constant-product behaviour. */
export interface VirtualReserves {
  reserve0: bigint;
  reserve1: bigint;
}

/**
 * Convert pool state to the equivalent (reserve0, reserve1) the delta formula
 * operates on. Mirrors `VirtualReserves.fromState`:
 *   reserve0 = liquidity * 2^96 / sqrtPriceX96
 *   reserve1 = liquidity * sqrtPriceX96 / 2^96
 */
export function virtualReservesFromState(sqrtPriceX96: bigint, liquidity: bigint): VirtualReserves {
  if (liquidity === 0n || sqrtPriceX96 === 0n) {
    return { reserve0: 0n, reserve1: 0n };
  }
  return {
    reserve0: (liquidity * Q96) / sqrtPriceX96,
    reserve1: (liquidity * sqrtPriceX96) / Q96,
  };
}

/** Inputs for {@link computeSignedDelta}, mirroring V4 `SwapParams`. */
export interface SignedDeltaParams {
  sqrtPriceX96: bigint;
  liquidity: bigint;
  /** true if swapping token0 -> token1. */
  zeroForOne: boolean;
  /** V4 convention: negative = exact-in, positive = exact-out. */
  amountSpecified: bigint;
}

/**
 * The signed per-mille reserve-shift indicator ("delta") for a swap. Positive
 * when token0 leaves the pool (price up), negative when token1 leaves (price
 * down), 0 for degenerate inputs. Mirrors `SmartFeeLib.computeSignedDelta`.
 *
 * Feed `delta` to {@link feeForDelta} for the point fee, or add it to the
 * pool's current cumulative and feed both ends to {@link marginalFee} for the
 * integral-mode fee the swap would pay.
 */
export function computeSignedDelta({
  sqrtPriceX96,
  liquidity,
  zeroForOne,
  amountSpecified,
}: SignedDeltaParams): bigint {
  const { reserve0, reserve1 } = virtualReservesFromState(sqrtPriceX96, liquidity);
  if (reserve0 === 0n || reserve1 === 0n || amountSpecified === 0n) return 0n;

  const exactIn = amountSpecified < 0n;
  const mag = exactIn ? -amountSpecified : amountSpecified;

  let amount0Out = 0n;
  let amount1Out = 0n;
  if (zeroForOne) {
    amount1Out = exactIn ? (mag * reserve1) / (reserve0 + mag) : mag;
  } else {
    amount0Out = exactIn ? (mag * reserve0) / (reserve1 + mag) : mag;
  }

  if (amount0Out !== 0n) return (1000n * amount0Out) / reserve0;
  if (amount1Out !== 0n) return -((1000n * amount1Out) / (reserve1 + amount1Out));
  return 0n;
}
