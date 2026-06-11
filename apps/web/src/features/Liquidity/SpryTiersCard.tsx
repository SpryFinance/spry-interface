import { formatFeePercent, TIER_BY_INDEX } from '@spry/fee'
import { Flex, Text, useIsDarkMode } from 'ui/src'
import { InfoCircleFilled } from 'ui/src/components/icons/InfoCircleFilled'
import { InfoTooltip } from 'uniswap/src/components/tooltip/InfoTooltip'
import dottedBackgroundDark from '~/assets/images/dotted-grid-dark.png'
import dottedBackground from '~/assets/images/dotted-grid.png'

/**
 * SPRY: distinct per-tier colors (Stable green, Like-asset teal, Blue-chip blue, Volatile amber,
 * Exotic red), indexed by on-chain tier. Shared with {@link SpryTierCurveChart} so a tier reads as the
 * same color in this list's dot and in the fee-curve chart beside it.
 */
export const TIER_COLORS = ['#1FC77C', '#16BDC4', '#4C82FB', '#F5A623', '#FB4A5A']

function TierDot({ color }: { color: string }): JSX.Element {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <circle cx={5} cy={5} r={5} fill={color} />
    </svg>
  )
}

/**
 * SPRY: replaces Uniswap's LP-incentives (UNI rewards) card on the positions page. Spry has no reward
 * token; instead this explains the dynamic-fee tier model and lists the five tiers with their
 * base-to-cap fee bands and per-tier hover detail. The companion {@link SpryTierCurveChart} plots
 * these same tiers as fee curves in the sidebar.
 */
export function SpryTiersCard() {
  const isDarkMode = useIsDarkMode()

  return (
    <Flex
      position="relative"
      overflow="hidden"
      gap="$spacing16"
      p="$spacing20"
      borderWidth="$spacing1"
      borderColor="$surface3"
      borderRadius="$rounded20"
      backgroundColor="$surface1"
    >
      {/*
        SPRY: dotted-grid backdrop carried over from the Uniswap rewards card this surface replaced.
        The asset is 740x192 (sized for the shorter rewards card), so we keep its horizontal dot density
        (width 100%) but tile vertically at natural height rather than stretch it on this taller card.
      */}
      <Flex
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        background={`url(${isDarkMode ? dottedBackground : dottedBackgroundDark})`}
        backgroundPosition="top center"
        backgroundSize="100% auto"
        backgroundRepeat="repeat"
      />
      <Flex gap="$spacing4" zIndex={1}>
        <Text variant="subheading2" color="$neutral1">
          Spry fee tiers
        </Text>
        <Text variant="body3" color="$neutral2">
          Spry pools charge a dynamic fee that rises with volatility and pool imbalance, then eases back toward the
          tier's base, instead of a single fixed fee. Every pool sits in one of five tiers, each with its own fee band
          and tick spacing.
        </Text>
      </Flex>

      <Flex gap="$spacing8" zIndex={1}>
        {TIER_BY_INDEX.map((tier, index) => {
          const color = TIER_COLORS[index] ?? '#888888'
          const base = formatFeePercent(tier.baseFeePips)
          const cap = formatFeePercent(tier.capFeePips)

          return (
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
              hoverStyle={{ backgroundColor: '$surface3' }}
            >
              <Flex row alignItems="center" gap="$spacing12" shrink>
                <TierDot color={color} />
                <Flex shrink>
                  <Text variant="body3" color="$neutral1">
                    {tier.label}
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    {tier.typicalPairs}
                  </Text>
                </Flex>
              </Flex>

              <Flex row alignItems="center" gap="$spacing6" shrink={false}>
                <Text variant="body3" color="$neutral2" textAlign="right">
                  {base} to {cap}
                </Text>
                <InfoTooltip
                  placement="top"
                  title={tier.label}
                  text={`Typical pairs: ${tier.typicalPairs}. The fee floats from a ${base} base up to a ${cap} cap as volatility and pool imbalance rise, then eases back. Tick spacing ${tier.tickSpacing}.`}
                  trigger={
                    <Flex cursor="help">
                      <InfoCircleFilled color="$neutral3" size="$icon.16" />
                    </Flex>
                  }
                />
              </Flex>
            </Flex>
          )
        })}
      </Flex>
    </Flex>
  )
}
