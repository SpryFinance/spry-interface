import { DYNAMIC_FEE_FLAG, formatFeePercent, TIER_BY_INDEX, type TierInfo } from '@spry/fee'
import { Flex, Text } from 'ui/src'
import type { FeeData } from 'uniswap/src/features/positions/types'
import { TierIcon } from 'uniswap/src/features/transactions/swap/components/SpryFeeWidget/TierIcon'
import { MouseoverTooltip } from '~/components/Tooltip'
import { TIER_COLOR_BY_TIER } from '~/features/Liquidity/spry/SpryTierBadge'

/**
 * SPRY: the create-position fee-tier picker. Replaces the stock static fee-tier
 * grid (0.01/0.05/0.3/1% + custom search): every Spry pool sits in one of five
 * dynamic-fee tiers, so the picker offers exactly those, styled like the rest
 * of the Spry tier UI (TierIcon glyph + tier color + base-to-cap band) with the
 * full detail on hover. Selecting a tier yields the dynamic-fee FeeData for
 * that tier's tick spacing.
 */
export function SpryTierSelector({
  selectedFee,
  onSelect,
  disabled = false,
}: {
  selectedFee?: FeeData
  onSelect: (tier: TierInfo, fee: FeeData) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <Flex
      gap="$gap8"
      opacity={disabled ? 0.6 : 1}
      pointerEvents={disabled ? 'none' : 'auto'}
      $platform-web={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
      }}
      $sm={{
        '$platform-web': {
          gridTemplateColumns: '1fr',
        },
      }}
    >
      {TIER_BY_INDEX.map((tier) => {
        const color = TIER_COLOR_BY_TIER[tier.tier]
        const isSelected = selectedFee?.isDynamic === true && selectedFee.tickSpacing === tier.tickSpacing
        const base = formatFeePercent(tier.baseFeePips)
        const cap = formatFeePercent(tier.capFeePips)
        return (
          <MouseoverTooltip
            key={tier.tier}
            text={`Typical pairs: ${tier.typicalPairs}. The fee floats from a ${base} base up to a ${cap} cap as volatility and pool imbalance rise, then eases back. Tick spacing ${tier.tickSpacing}.`}
            placement="top"
          >
            <Flex
              row
              alignItems="center"
              justifyContent="space-between"
              gap="$gap12"
              py="$spacing12"
              px="$spacing12"
              borderRadius="$rounded12"
              borderWidth="$spacing1"
              borderColor={isSelected ? '$accent1' : '$surface3'}
              backgroundColor={isSelected ? '$surface2' : '$surface1'}
              hoverStyle={{ backgroundColor: '$surface2' }}
              cursor="pointer"
              onPress={() => {
                onSelect(tier, {
                  feeAmount: DYNAMIC_FEE_FLAG,
                  tickSpacing: tier.tickSpacing,
                  isDynamic: true,
                })
              }}
            >
              <Flex row alignItems="center" gap="$spacing8" shrink>
                <TierIcon tier={tier.tier} size={16} color={color} />
                <Flex shrink>
                  <Text variant="body3" color={color}>
                    {tier.label}
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    {tier.typicalPairs}
                  </Text>
                </Flex>
              </Flex>
              <Text variant="body4" color="$neutral2" textAlign="right" flexShrink={0}>
                {base} to {cap}
              </Text>
            </Flex>
          </MouseoverTooltip>
        )
      })}
    </Flex>
  )
}
