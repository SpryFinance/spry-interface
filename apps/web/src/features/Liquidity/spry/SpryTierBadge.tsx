import { TIER_BY_INDEX, tierInfo, type PoolTier } from '@spry/fee'
import { Flex, Text } from 'ui/src'
import { TierIcon } from 'uniswap/src/features/transactions/swap/components/SpryFeeWidget/TierIcon'
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
