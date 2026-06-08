import { formatFeePercent, isValidTickSpacing, tierFromTickSpacing, tierInfo } from '@spry/fee'
import { type Hex } from '@spry/sdk'
import { useMemo } from 'react'
import { Flex, Text, Tooltip } from 'ui/src'
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
  const hops: SprySwapFeeHop[] = []
  for (const pool of firstRoute) {
    if (pool.type !== 'v4-pool') {
      continue
    }
    const tickSpacing = Number(pool.tickSpacing)
    const tokenIn = pool.tokenIn.address
    const tokenOut = pool.tokenOut.address
    if (!isValidTickSpacing(tickSpacing) || !tokenIn || !tokenOut) {
      continue
    }
    hops.push({
      poolId: pool.address as Hex,
      tier: tierFromTickSpacing(tickSpacing),
      sqrtPriceX96: BigInt(pool.sqrtRatioX96 ?? '0'),
      liquidity: BigInt(pool.liquidity ?? '0'),
      amountIn: BigInt(pool.amountIn ?? '0'),
      // currency0 is the lower-sorted address, so the input is token0 iff it sorts first.
      zeroForOne: BigInt(tokenIn) < BigInt(tokenOut),
    })
  }
  return hops
}

/**
 * Surfaces the Spry dynamic fee in the swap details (Base Sepolia only). Unlike a
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
  if (chainId !== UniverseChainId.BaseSepolia || !firstHop) {
    return null
  }

  const allSameTier = hops.every((hop) => hop.tier === firstHop.tier)
  const info = tierInfo(firstHop.tier)
  const baseFee = formatFeePercent(info.baseFeePips)
  const capFee = formatFeePercent(info.capFeePips)
  const tierLabel = allSameTier ? info.label : 'Multiple tiers'

  const value = swapFee ? formatFeePercent(swapFee.feePips) : `from ${baseFee}`

  const countdown =
    swapFee && swapFee.blocksRemaining > 0
      ? ` It eases back toward ${baseFee} over ~${swapFee.blocksRemaining} block${swapFee.blocksRemaining === 1 ? '' : 's'} of quiet trading.`
      : ''
  const tierAndRange = allSameTier ? `${tierLabel} tier (${baseFee} to ${capFee}). ` : ''
  const tooltipText = `${tierAndRange}This is the fee your swap pays: the SpryHook's fee rises with the price movement your trade causes within the current block window.${countdown}`

  return (
    <Flex row alignItems="center" justifyContent="space-between">
      <Tooltip placement="top">
        <Tooltip.Trigger cursor="default">
          <Text color="$neutral2" variant="body3">
            Dynamic fee
          </Text>
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
