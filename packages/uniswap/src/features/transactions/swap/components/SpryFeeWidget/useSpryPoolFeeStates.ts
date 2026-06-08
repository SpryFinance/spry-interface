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
} from 'uniswap/src/features/transactions/swap/services/tradeService/spryRouting'
import { ONE_SECOND_MS } from 'utilities/src/time/time'

/** Live dynamic-fee state of one Spry pool on the selected route. */
export interface SpryPoolFeeState {
  poolId: Hex
  tier: PoolTier
  tierLabel: string
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
      // Represent the pair with its shortest route (fewest hops); the per-swap best
      // route depends on the amount, which this amount-less widget does not have.
      const route = routes.reduce((shortest, candidate) => (candidate.length < shortest.length ? candidate : shortest))

      const read: ReadContractFn = (request) => spryPublicClient.readContract(request as never) as Promise<unknown>
      const hook = createSpryHookClient(read, config.addresses.spryHook)
      const [blockWindow, currentBlock] = await Promise.all([
        hook.getBlockWindow(),
        spryPublicClient.getBlockNumber({ cacheTime: 0 }),
      ])

      const symbolOf = (address: Address): string =>
        address === NATIVE_CURRENCY ? 'ETH' : (findSpryCurrency(graph, address)?.symbol ?? 'token')

      return Promise.all(
        route.map(async (hop) => {
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
            baseFeePips: info.baseFeePips,
            capFeePips: info.capFeePips,
            currentFeePips: feeForDelta(cumulative, feeParams),
            zone: zoneOf(cumulative, feeParams),
            blocksRemaining: expired ? 0 : Number(windowEnd - currentBlock),
            pairLabel: `${symbolOf(hop.currencyIn)} / ${symbolOf(hop.currencyOut)}`,
          }
        }),
      )
    },
  })

  return data ?? null
}
