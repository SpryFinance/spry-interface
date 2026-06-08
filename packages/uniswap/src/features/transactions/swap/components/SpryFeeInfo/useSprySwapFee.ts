import { getSpryConfig } from '@spry/config'
import { computeSignedDelta, marginalFee, tierParams, type PoolTier } from '@spry/fee'
import { createSpryHookClient, type Hex, type ReadContractFn } from '@spry/sdk'
import { useQuery } from '@tanstack/react-query'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { ONE_SECOND_MS } from 'utilities/src/time/time'

/** One route hop with the state needed to price its dynamic fee. */
export interface SprySwapFeeHop {
  poolId: Hex
  tier: PoolTier
  sqrtPriceX96: bigint
  liquidity: bigint
  /** The hop's exact input (raw). Drives the cumulative shift the swap causes. */
  amountIn: bigint
  zeroForOne: boolean
}

export interface SprySwapFee {
  /** The fee this swap pays across hops, in pips (sum of per-hop marginal fees). */
  feePips: number
  /** Blocks until the LAST pool window resets, i.e. when the whole route's fee has eased back to base. */
  blocksRemaining: number
  /** The pool window length, in blocks. */
  blockWindow: number
}

/**
 * The dynamic fee THIS swap pays, computed the way the SpryHook does: read each
 * pool's current block-windowed cumulative on-chain, add the cumulative shift the
 * swap causes (computeSignedDelta), and take the curve's integral-mode marginal fee
 * over that move. This mirrors the hook (it is not the pool's resting fee, which
 * ignores the swap's own price impact), and is robust to concentrated liquidity that
 * a net-vs-gross estimate is not. Polls roughly per block; also returns the window
 * countdown. Null when not applicable or before the first read resolves.
 */
export function useSprySwapFee(params: { chainId: number; hops: SprySwapFeeHop[] }): SprySwapFee | null {
  const { chainId, hops } = params
  const enabled = chainId === UniverseChainId.BaseSepolia && hops.length > 0
  // Key on every input the fee math consumes, so a same-pool/same-amount direction
  // flip (zeroForOne) or a liquidity change re-fetches instead of serving a stale fee.
  const hopsKey = hops
    .map(
      (hop) =>
        `${hop.poolId}:${hop.tier}:${hop.zeroForOne}:${hop.amountIn.toString()}:${hop.sqrtPriceX96.toString()}:${hop.liquidity.toString()}`,
    )
    .join(',')

  const { data } = useQuery({
    queryKey: ['sprySwapFee', chainId, hopsKey],
    enabled,
    refetchInterval: ONE_SECOND_MS * 6,
    staleTime: ONE_SECOND_MS * 3,
    queryFn: async (): Promise<SprySwapFee | null> => {
      const config = getSpryConfig(chainId)
      if (!config) {
        return null
      }
      const read: ReadContractFn = (request) => spryPublicClient.readContract(request as never) as Promise<unknown>
      const hook = createSpryHookClient(read, config.addresses.spryHook)
      const [blockWindow, currentBlock] = await Promise.all([
        hook.getBlockWindow(),
        // Read fresh so window expiry is detected as blocks advance, not from a cache.
        spryPublicClient.getBlockNumber({ cacheTime: 0 }),
      ])

      const perHop = await Promise.all(
        hops.map(async (hop) => {
          const window = await hook.getPoolWindow(hop.poolId)
          const delta = computeSignedDelta({
            sqrtPriceX96: hop.sqrtPriceX96,
            liquidity: hop.liquidity,
            zeroForOne: hop.zeroForOne,
            // Priced from the resolved per-hop input (exact-in convention) for both
            // trade types. For exact-output the hook integrates from the output side,
            // but that input was derived from the same curve, so the fee differs by
            // sub-pip and never changes the displayed value.
            amountSpecified: -hop.amountIn,
          })
          // Once the window has elapsed, the hook resets the cumulative on the next
          // swap (the stored signedCum stays stale until then), so price the fee from
          // a fresh window (cumBefore = 0). Otherwise the fee never relaxes back to
          // base after the window passes.
          const windowEnd = window.windowStart + blockWindow
          const expired = windowEnd <= currentBlock
          const cumBefore = expired ? BigInt(0) : window.signedCum
          const feePips = marginalFee(cumBefore, cumBefore + delta, tierParams(hop.tier))
          const remaining = expired ? BigInt(0) : windowEnd - currentBlock
          return { feePips, remaining }
        }),
      )

      const feePips = perHop.reduce((sum, hop) => sum + hop.feePips, 0)
      // Each pool has its own window; the route's fee fully eases back to base only
      // once the LAST window resets, so report the longest remaining.
      const maxRemaining = perHop.reduce((max, hop) => (hop.remaining > max ? hop.remaining : max), BigInt(0))
      return { feePips, blocksRemaining: Number(maxRemaining), blockWindow: Number(blockWindow) }
    },
  })

  return data ?? null
}
