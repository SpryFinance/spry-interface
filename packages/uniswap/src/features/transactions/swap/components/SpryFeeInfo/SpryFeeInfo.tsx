import { formatFeePercent, isValidTickSpacing, tierFromTickSpacing, tierInfo } from '@spry/fee'
import { type Hex } from '@spry/sdk'
import { TradingApi } from '@universe/api'
import { useMemo } from 'react'
import { Flex, Text, Tooltip } from 'ui/src'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import {
  useSpryLiveFee,
  type SpryFeePool,
} from 'uniswap/src/features/transactions/swap/components/SpryFeeInfo/useSpryLiveFee'
import { type Trade } from 'uniswap/src/features/transactions/swap/types/trade'
import { isClassic } from 'uniswap/src/features/transactions/swap/utils/routing'

/** The route's Spry pools (id + tier), read from the quote. Empty for non-Spry trades. */
function spryRoutePools(trade: Trade): SpryFeePool[] {
  if (!isClassic(trade)) {
    return []
  }
  const firstRoute = trade.quote.quote.route?.[0]
  return (firstRoute ?? [])
    .filter((pool): pool is TradingApi.V4PoolInRoute => pool.type === 'v4-pool')
    .filter((pool) => isValidTickSpacing(Number(pool.tickSpacing)))
    .map((pool) => ({ poolId: pool.address as Hex, tier: tierFromTickSpacing(Number(pool.tickSpacing)) }))
}

/**
 * Surfaces Spry's dynamic fee in the swap details (Base Sepolia only). The SpryHook
 * recomputes a pool's fee each block from its recent price movement, bounded by the
 * tier; this row shows the live fee (read on-chain, polled per block) with the tier
 * range and how long until the fee relaxes toward base. Falls back to the static
 * tier range before the live read resolves. Renders nothing for non-Spry trades.
 */
export function SpryFeeInfo({ trade, chainId }: { trade: Trade; chainId: UniverseChainId }): JSX.Element | null {
  const pools = useMemo(() => spryRoutePools(trade), [trade])
  const live = useSpryLiveFee({ chainId, pools })

  const firstPool = pools[0]
  if (chainId !== UniverseChainId.BaseSepolia || !firstPool) {
    return null
  }

  const allSameTier = pools.every((pool) => pool.tier === firstPool.tier)
  const info = tierInfo(firstPool.tier)
  const baseFee = formatFeePercent(info.baseFeePips)
  const capFee = formatFeePercent(info.capFeePips)
  const tierLabel = allSameTier ? info.label : 'Multiple tiers'

  let value: string
  if (live) {
    value = formatFeePercent(live.feePips)
  } else if (allSameTier) {
    value = `from ${baseFee}`
  } else {
    value = 'Dynamic'
  }

  const countdown =
    live && live.blocksRemaining > 0
      ? ` It eases back toward ${baseFee} over ~${live.blocksRemaining} block${live.blocksRemaining === 1 ? '' : 's'} of quiet trading.`
      : ''
  const tooltipText = allSameTier
    ? `${tierLabel} tier (${baseFee} to ${capFee}). The SpryHook recomputes the fee each block from the pool's recent price movement.${countdown}`
    : "The SpryHook recomputes the fee each block from each pool's recent price movement."

  return (
    <Flex row alignItems="center" justifyContent="space-between">
      <Tooltip placement="top">
        <Tooltip.Trigger cursor="default">
          <Text color="$neutral2" variant="body3">
            Dynamic fee
          </Text>
        </Tooltip.Trigger>
        <Tooltip.Content maxWidth={300}>
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
