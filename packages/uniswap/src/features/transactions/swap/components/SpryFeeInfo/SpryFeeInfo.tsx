import { formatFeePercent, isValidTickSpacing, tierFromTickSpacing, tierInfo } from '@spry/fee'
import { TradingApi } from '@universe/api'
import { Flex, Text, Tooltip } from 'ui/src'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { Trade } from 'uniswap/src/features/transactions/swap/types/trade'
import { isClassic } from 'uniswap/src/features/transactions/swap/utils/routing'

/**
 * Surfaces Spry's dynamic-fee tier in the swap details (Base Sepolia only). A Spry
 * pool's fee is recomputed each block by the SpryHook from recent price movement,
 * bounded by the pool's tier, so we show the tier and that fee range. Returns null
 * for non-Spry trades, where the normal Uniswap details apply.
 */
export function SpryFeeInfo({ trade, chainId }: { trade: Trade; chainId: UniverseChainId }): JSX.Element | null {
  if (chainId !== UniverseChainId.BaseSepolia || !isClassic(trade)) {
    return null
  }

  // The tier is carried by each pool's tick spacing (the route is read from the quote).
  const firstRoute = trade.quote.quote.route?.[0]
  const tiers = (firstRoute ?? [])
    .filter((pool): pool is TradingApi.V4PoolInRoute => pool.type === 'v4-pool')
    .map((pool) => Number(pool.tickSpacing))
    .filter((tickSpacing) => isValidTickSpacing(tickSpacing))
    .map((tickSpacing) => tierFromTickSpacing(tickSpacing))

  const firstTier = tiers[0]
  if (firstTier === undefined) {
    return null
  }

  const allSameTier = tiers.every((tier) => tier === firstTier)
  const info = tierInfo(firstTier)
  const baseFee = formatFeePercent(info.baseFeePips)
  const capFee = formatFeePercent(info.capFeePips)

  const value = allSameTier ? info.label : 'Multiple tiers'
  const tooltipText = allSameTier
    ? `${info.label} tier. Spry's fee is dynamic, from ${baseFee} up to ${capFee}, recomputed each block from the pool's recent price movement.`
    : "Spry's fee is dynamic, recomputed each block from each pool's recent price movement."

  return (
    <Flex row alignItems="center" justifyContent="space-between">
      <Tooltip placement="top">
        <Tooltip.Trigger cursor="default">
          <Text color="$neutral2" variant="body3">
            Fee tier
          </Text>
        </Tooltip.Trigger>
        <Tooltip.Content maxWidth={280}>
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
