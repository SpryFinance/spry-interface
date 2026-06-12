import { formatFeePercent, isValidTickSpacing, TIER_BY_INDEX, tierFromTickSpacing, tierInfo, type PoolTier } from '@spry/fee'
import { Flex, Text } from 'ui/src'
import type { FeeData } from 'uniswap/src/features/positions/types'
import { TierIcon } from 'uniswap/src/features/transactions/swap/components/SpryFeeWidget/TierIcon'
import { MouseoverTooltip } from '~/components/Tooltip'
import { TIER_COLORS } from '~/features/Liquidity/SpryTiersCard'

/** Per-tier color, keyed by tier (TIER_COLORS is ordered by on-chain tier index). */
export const TIER_COLOR_BY_TIER = Object.fromEntries(
  TIER_BY_INDEX.map((info, index) => [info.tier, TIER_COLORS[index] ?? '#888888']),
) as Record<PoolTier, string>

/**
 * SPRY: a position's tier, shown the way the swap page's dynamic-fee widget
 * draws tiers (the TierIcon glyph + the tier label), in the tier's color.
 */
export function SpryTierBadge({ tier }: { tier: PoolTier }): JSX.Element {
  const color = TIER_COLOR_BY_TIER[tier]
  return (
    <Flex row gap="$spacing6" alignItems="center">
      <TierIcon tier={tier} size={14} color={color} />
      <Text variant="body3" color={color}>
        {tierInfo(tier).label}
      </Text>
    </Flex>
  )
}

/**
 * SPRY: the tier badge derived from a position form's FeeData (a dynamic-fee
 * tier is identified by its tick spacing), with the full tier story on hover.
 * Renders nothing for fee configs that are not a Spry tier.
 */
export function SpryTierBadgeFromFee({ feeTier }: { feeTier?: FeeData }): JSX.Element | null {
  if (!feeTier?.isDynamic || !isValidTickSpacing(feeTier.tickSpacing)) {
    return null
  }
  const tier = tierFromTickSpacing(feeTier.tickSpacing)
  const info = tierInfo(tier)
  const base = formatFeePercent(info.baseFeePips)
  const cap = formatFeePercent(info.capFeePips)
  return (
    <MouseoverTooltip
      text={`${info.label} tier (${info.typicalPairs}). The fee floats from a ${base} base up to a ${cap} cap as volatility and pool imbalance rise, then eases back. Tick spacing ${info.tickSpacing}.`}
      placement="top"
    >
      <Flex cursor="help">
        <SpryTierBadge tier={tier} />
      </Flex>
    </MouseoverTooltip>
  )
}
