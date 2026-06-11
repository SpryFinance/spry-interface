import { formatFeePercent, TIER_BY_INDEX } from '@spry/fee'
import type { ColorTokens } from 'ui/src'
import { Flex, Text } from 'ui/src'

// SPRY: a green -> red ramp conveying rising volatility / fee band across the five tiers.
const TIER_ACCENTS: ColorTokens[] = [
  '$statusSuccess',
  '$statusSuccess',
  '$accent1',
  '$statusWarning',
  '$statusCritical',
]

/**
 * SPRY: replaces Uniswap's LP-incentives (UNI rewards) card on the positions page. Spry has no
 * reward token; instead this explains the Spry dynamic-fee tier model in text and visually.
 */
export function SpryTiersCard() {
  return (
    <Flex
      gap="$spacing16"
      p="$spacing20"
      borderWidth="$spacing1"
      borderColor="$surface3"
      borderRadius="$rounded20"
      backgroundColor="$surface1"
    >
      <Flex gap="$spacing4">
        <Text variant="subheading2" color="$neutral1">
          Spry fee tiers
        </Text>
        <Text variant="body3" color="$neutral2">
          Spry pools charge a dynamic fee that rises with volatility and pool imbalance, then eases back toward the
          tier's base, instead of a single fixed fee. Every pool sits in one of five tiers, each with its own fee band
          and tick spacing.
        </Text>
      </Flex>
      <Flex gap="$spacing8">
        {TIER_BY_INDEX.map((tier, index) => (
          <Flex
            key={tier.tier}
            row
            alignItems="center"
            justifyContent="space-between"
            gap="$spacing12"
            py="$spacing8"
            px="$spacing12"
            borderRadius="$rounded12"
            backgroundColor="$surface2"
          >
            <Flex row alignItems="center" gap="$spacing12" shrink>
              <Flex
                width="$spacing8"
                height="$spacing8"
                borderRadius="$roundedFull"
                backgroundColor={TIER_ACCENTS[index] ?? '$accent1'}
              />
              <Flex shrink>
                <Text variant="body3" color="$neutral1">
                  {tier.label}
                </Text>
                <Text variant="body4" color="$neutral2">
                  {tier.typicalPairs}
                </Text>
              </Flex>
            </Flex>
            <Text variant="body3" color="$neutral2" textAlign="right">
              {formatFeePercent(tier.baseFeePips)} to {formatFeePercent(tier.capFeePips)}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  )
}
