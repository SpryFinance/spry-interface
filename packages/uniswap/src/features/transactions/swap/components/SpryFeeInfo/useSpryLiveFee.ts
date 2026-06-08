import { getSpryConfig } from '@spry/config'
import { feeForDelta, type PoolTier } from '@spry/fee'
import { createSpryHookClient, type Hex, type ReadContractFn } from '@spry/sdk'
import { useQuery } from '@tanstack/react-query'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { ONE_SECOND_MS } from 'utilities/src/time/time'

/** One pool of the route to price the live fee for. */
export interface SpryFeePool {
  poolId: Hex
  tier: PoolTier
}

export interface SpryLiveFee {
  /** The route's current point fee (sum across hops), in pips. */
  feePips: number
  /** Blocks until the soonest pool window resets, after which fees ease toward base. */
  blocksRemaining: number
  /** The pool window length, in blocks. */
  blockWindow: number
}

/**
 * Reads the live Spry dynamic fee on-chain for a route's pools: the SpryHook's
 * current block-windowed cumulative drives the fee-curve point fee, and the window
 * countdown says how long until it relaxes toward base. Polls roughly per block so
 * the value tracks the current window. Returns null when not applicable (other
 * chains, no pools) or before the first read resolves, so the caller can fall back
 * to the static tier range.
 */
export function useSpryLiveFee(params: { chainId: number; pools: SpryFeePool[] }): SpryLiveFee | null {
  const { chainId, pools } = params
  const enabled = chainId === UniverseChainId.BaseSepolia && pools.length > 0
  const poolIdsKey = pools.map((pool) => pool.poolId).join(',')

  const { data } = useQuery({
    queryKey: ['spryLiveFee', chainId, poolIdsKey],
    enabled,
    refetchInterval: ONE_SECOND_MS * 12,
    staleTime: ONE_SECOND_MS * 6,
    queryFn: async (): Promise<SpryLiveFee | null> => {
      const config = getSpryConfig(chainId)
      if (!config) {
        return null
      }
      const read: ReadContractFn = (request) => spryPublicClient.readContract(request as never) as Promise<unknown>
      const hook = createSpryHookClient(read, config.addresses.spryHook)
      const [blockWindow, currentBlock] = await Promise.all([hook.getBlockWindow(), spryPublicClient.getBlockNumber()])

      const perPool = await Promise.all(
        pools.map(async (pool) => {
          const window = await hook.getPoolWindow(pool.poolId)
          const feePips = feeForDelta(window.signedCum, hook.getTierParams(pool.tier))
          const windowEnd = window.windowStart + blockWindow
          const remaining = windowEnd > currentBlock ? windowEnd - currentBlock : BigInt(0)
          return { feePips, remaining }
        }),
      )

      const feePips = perPool.reduce((sum, pool) => sum + pool.feePips, 0)
      const minRemaining = perPool.reduce((min, pool) => (pool.remaining < min ? pool.remaining : min), blockWindow)
      return { feePips, blocksRemaining: Number(minRemaining), blockWindow: Number(blockWindow) }
    },
  })

  return data ?? null
}
