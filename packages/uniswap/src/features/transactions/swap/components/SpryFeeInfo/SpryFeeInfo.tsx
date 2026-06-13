import { isSpryChain } from '@spry/config'
import { formatFeePercent, isValidTickSpacing, tierFromTickSpacing, tierInfo } from '@spry/fee'
import { type Hex } from '@spry/sdk'
import { TradingApi } from '@universe/api'
import { useMemo } from 'react'
import { Flex, Text, Tooltip } from 'ui/src'
import { InfoCircle } from 'ui/src/components/icons/InfoCircle'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import {
  useSprySwapFee,
  type SprySwapFeeHop,
} from 'uniswap/src/features/transactions/swap/components/SpryFeeInfo/useSprySwapFee'
import { type Trade } from 'uniswap/src/features/transactions/swap/types/trade'
import { isClassic } from 'uniswap/src/features/transactions/swap/utils/routing'

/** The route's Spry pools with the per-hop state the fee math needs. Empty for non-Spry trades. */
function spryRouteHops(trade: Trade): SprySwapFeeHop[] {
  if (!isClassic(trade)) {
    return []
  }
  const firstRoute = trade.quote.quote.route?.[0] ?? []
  const v4Pools = firstRoute.filter((pool): pool is TradingApi.V4PoolInRoute => pool.type === 'v4-pool')
  const hops: SprySwapFeeHop[] = []
  for (const pool of v4Pools) {
    const tickSpacing = Number(pool.tickSpacing)
    const tokenIn = pool.tokenIn.address
    const tokenOut = pool.tokenOut.address
    if (!isValidTickSpacing(tickSpacing) || !tokenIn || !tokenOut) {
      continue
    }
    hops.push({
      poolId: pool.address as Hex,
      tier: tierFromTickSpacing(tickSpacing),
      sqrtPriceX96: BigInt(pool.sqrtRatioX96),
      liquidity: BigInt(pool.liquidity),
      amountIn: BigInt(pool.amountIn ?? '0'),
      // currency0 is the lower-sorted address, so the input is token0 iff it sorts first.
      zeroForOne: BigInt(tokenIn) < BigInt(tokenOut),
    })
  }
  return hops
}

/**
 * Surfaces the Spry dynamic fee in the swap details (Spry chains only). Unlike a
 * pool's resting fee, the SpryHook fee rises with the price movement a swap causes,
 * so this shows the fee THIS swap pays (computed the way the hook does, read live
 * on-chain), the tier range, and how long until the fee relaxes toward base. Falls
 * back to the static tier range before the read resolves. Renders nothing for
 * non-Spry trades.
 */
export function SpryFeeInfo({ trade, chainId }: { trade: Trade; chainId: UniverseChainId }): JSX.Element | null {
  const hops = useMemo(() => spryRouteHops(trade), [trade])
  const swapFee = useSprySwapFee({ chainId, hops })

  const firstHop = hops[0]
  if (!isSpryChain(chainId) || !firstHop) {
    return null
  }

  // Each hop is a separate pool with its own block window; the route's fee is the
  // sum of the per-hop fees, bounded by the sum of the per-pool [base, cap].
  const baseFeePips = hops.reduce((sum, hop) => sum + tierInfo(hop.tier).baseFeePips, 0)
  const capFeePips = hops.reduce((sum, hop) => sum + tierInfo(hop.tier).capFeePips, 0)
  const baseFee = formatFeePercent(baseFeePips)
  const capFee = formatFeePercent(capFeePips)
  const multiHop = hops.length > 1

  const value = swapFee ? formatFeePercent(swapFee.feePips) : `from ${baseFee}`

  const countdown =
    swapFee && swapFee.blocksRemaining > 0
      ? ` It eases back toward ${baseFee} over ~${swapFee.blocksRemaining} block${swapFee.blocksRemaining === 1 ? '' : 's'} of quiet trading.`
      : ''
  const lead = multiHop ? `${hops.length}-hop Spry route. ` : `${tierInfo(firstHop.tier).label} tier. `
  const recompute = multiHop ? "each pool's fee every block" : 'it every block'
  const tooltipText = `${lead}The fee your swap pays, ${baseFee} to ${capFee}. The SpryHook recomputes ${recompute} from recent price movement, so it rises with your trade's impact.${countdown}`

  return (
    <Flex row alignItems="center" justifyContent="space-between">
      <Tooltip placement="top">
        <Tooltip.Trigger cursor="default">
          <Flex row alignItems="center" gap="$spacing4">
            <Text color="$neutral2" variant="body3">
              Dynamic fee
            </Text>
            <InfoCircle color="$neutral3" size="$icon.12" />
          </Flex>
        </Tooltip.Trigger>
        <Tooltip.Content maxWidth={320}>
          <Text variant="body4">{tooltipText}</Text>
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip>
      <Text color="$neutral1" variant="body3">
        {value}
      </Text>
    </Flex>
  )
}
