import { getSpryConfig } from '@spry/config'
import { feeForDelta, tierFromTickSpacing, tierInfo, tierParams, zoneOf, type PoolTier, type SpryZone } from '@spry/fee'
import { createSpryHookClient, NATIVE_CURRENCY, type Address, type Hex, type ReadContractFn } from '@spry/sdk'
import { useQuery } from '@tanstack/react-query'
import { type Currency } from '@uniswap/sdk-core'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import {
  discoverSpryPoolGraph,
  findSpryCurrency,
  findSpryRoutes,
  toPoolCurrency,
  type SpryHop,
} from 'uniswap/src/features/transactions/swap/services/tradeService/spryRouting'
import { ONE_SECOND_MS } from 'utilities/src/time/time'

/** Live dynamic-fee state of one Spry pool on the selected route. */
export interface SpryPoolFeeState {
  poolId: Hex
  tier: PoolTier
  tierLabel: string
  /** On-chain tier index 0..4 (orders tiers within a hop). */
  tierIndex: number
  baseFeePips: number
  capFeePips: number
  /** The pool's CURRENT resting fee (the fee a tiny swap would pay right now). */
  currentFeePips: number
  /** Which curve zone the pool's cumulative currently sits in. */
  zone: SpryZone
  /** Blocks until the window resets and the fee eases back to base (0 when already at base). */
  blocksRemaining: number
  /** e.g. "ETH / sptA" - the pool's own pair (useful for multi-hop routes). */
  pairLabel: string
  /** This pool's hop position in the route (groups multi-tier hops together). */
  hopIndex: number
}

/**
 * The live dynamic-fee state of the pool(s) the selected pair would route through
 * (Base Sepolia only). Unlike the per-swap fee row in the review, this needs no
 * connected wallet or amount: it reads each pool's block-windowed cumulative
 * on-chain and maps it through the @spry/fee curve to a resting fee + zone, so the
 * swap form can show the pool's current "fee weather". Polls ~per block. Returns
 * null until the first read resolves, or when there is no Spry route for the pair.
 */
export function useSpryPoolFeeStates(params: {
  chainId: number
  currencyIn: Maybe<Currency>
  currencyOut: Maybe<Currency>
}): SpryPoolFeeState[] | null {
  const { chainId, currencyIn, currencyOut } = params
  const enabled = chainId === UniverseChainId.BaseSepolia && Boolean(currencyIn) && Boolean(currencyOut)
  const routeKey = currencyIn && currencyOut ? `${toPoolCurrency(currencyIn)}->${toPoolCurrency(currencyOut)}` : ''

  const { data } = useQuery({
    queryKey: ['spryPoolFeeStates', chainId, routeKey],
    enabled,
    refetchInterval: ONE_SECOND_MS * 6,
    staleTime: ONE_SECOND_MS * 3,
    queryFn: async (): Promise<SpryPoolFeeState[]> => {
      if (!currencyIn || !currencyOut) {
        return []
      }
      const config = getSpryConfig(chainId)
      if (!config) {
        return []
      }
      const graph = await discoverSpryPoolGraph(chainId)
      if (!graph) {
        return []
      }
      const routes = findSpryRoutes({
        pools: graph.pools,
        from: toPoolCurrency(currencyIn),
        to: toPoolCurrency(currencyOut),
      })
      if (routes.length === 0) {
        return []
      }
      // Show every pool the pair could route through at the shortest hop count: for a
      // multi-tier pair that is each of its tiers (a tier IS a distinct pool); for a
      // multi-hop pair it is the hops. Deduped by poolId. The per-swap router still
      // quotes all of these and picks the best; this widget just surfaces their state.
      const minHops = Math.min(...routes.map((candidate) => candidate.length))
      const uniquePools = new Map<string, { hop: SpryHop; hopIndex: number }>()
      for (const candidate of routes) {
        if (candidate.length !== minHops) {
          continue
        }
        candidate.forEach((hop, hopIndex) => {
          if (!uniquePools.has(hop.poolId)) {
            uniquePools.set(hop.poolId, { hop, hopIndex })
          }
        })
      }

      const read: ReadContractFn = (request) => spryPublicClient.readContract(request as never) as Promise<unknown>
      const hook = createSpryHookClient(read, config.addresses.spryHook)
      const [blockWindow, currentBlock] = await Promise.all([
        hook.getBlockWindow(),
        spryPublicClient.getBlockNumber({ cacheTime: 0 }),
      ])

      const symbolOf = (address: Address): string =>
        address === NATIVE_CURRENCY ? 'ETH' : (findSpryCurrency(graph, address)?.symbol ?? 'token')

      const result = await Promise.all(
        [...uniquePools.values()].map(async ({ hop, hopIndex }) => {
          const tier = tierFromTickSpacing(hop.poolKey.tickSpacing)
          const feeParams = tierParams(tier)
          const info = tierInfo(tier)
          const window = await hook.getPoolWindow(hop.poolId)
          // After the window elapses the hook resets the cumulative on the next swap,
          // so a quiet/elapsed window is already back at base (cumBefore = 0).
          const windowEnd = window.windowStart + blockWindow
          const expired = windowEnd <= currentBlock
          const cumulative = expired ? BigInt(0) : window.signedCum
          return {
            poolId: hop.poolId,
            tier,
            tierLabel: info.label,
            tierIndex: info.index,
            baseFeePips: info.baseFeePips,
            capFeePips: info.capFeePips,
            currentFeePips: feeForDelta(cumulative, feeParams),
            zone: zoneOf(cumulative, feeParams),
            blocksRemaining: expired ? 0 : Number(windowEnd - currentBlock),
            pairLabel: `${symbolOf(hop.currencyIn)} / ${symbolOf(hop.currencyOut)}`,
            hopIndex,
          }
        }),
      )
      // Group by hop (route order), then by tier within a hop, so a multi-hop route's
      // tiers stay grouped under each hop instead of interleaving.
      result.sort((a, b) => a.hopIndex - b.hopIndex || a.tierIndex - b.tierIndex)
      return result
    },
  })

  return data ?? null
}
