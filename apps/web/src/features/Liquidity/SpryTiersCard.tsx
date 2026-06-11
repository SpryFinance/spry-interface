import { formatFeePercent, TIER_BY_INDEX } from '@spry/fee'
import type { ColorTokens } from 'ui/src'
import { Flex, Text, useIsDarkMode } from 'ui/src'
import { InfoCircleFilled } from 'ui/src/components/icons/InfoCircleFilled'
import { InfoTooltip } from 'uniswap/src/components/tooltip/InfoTooltip'
import dottedBackgroundDark from '~/assets/images/dotted-grid-dark.png'
import dottedBackground from '~/assets/images/dotted-grid.png'

// SPRY: a green -> red ramp conveying the rising volatility / fee band across the five tiers.
const TIER_ACCENTS: ColorTokens[] = [
  '$statusSuccess',
  '$statusSuccess',
  '$accent1',
  '$statusWarning',
  '$statusCritical',
]

// Shared horizontal scale for the fee-range bars: 0% to 10% (pips, where 10_000 pips = 1%).
const MAX_FEE_PIPS = 100_000
// Fixed side columns keep every bar (and the axis below) aligned on a common scale.
const LABEL_COL_WIDTH = 168
const FEE_COL_WIDTH = 128

/**
 * SPRY: replaces Uniswap's LP-incentives (UNI rewards) card on the positions page. Spry has no
 * reward token; instead this explains the Spry dynamic-fee tier model in text and as a small
 * fee-range chart (each tier's band plotted on a shared 0% to 10% scale), with per-tier hover info.
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
          const accent = TIER_ACCENTS[index] ?? '$accent1'
          const base = formatFeePercent(tier.baseFeePips)
          const cap = formatFeePercent(tier.capFeePips)
          const leftPct = (tier.baseFeePips / MAX_FEE_PIPS) * 100
          const widthPct = Math.max(((tier.capFeePips - tier.baseFeePips) / MAX_FEE_PIPS) * 100, 1.5)

          return (
            <Flex
              key={tier.tier}
              row
              alignItems="center"
              gap="$spacing12"
              py="$spacing8"
              px="$spacing12"
              borderRadius="$rounded12"
              backgroundColor="$surface2"
              hoverStyle={{ backgroundColor: '$surface3' }}
            >
              <Flex row alignItems="center" gap="$spacing12" width={LABEL_COL_WIDTH} shrink={false}>
                <Flex width="$spacing8" height="$spacing8" borderRadius="$roundedFull" backgroundColor={accent} />
                <Flex shrink>
                  <Text variant="body3" color="$neutral1">
                    {tier.label}
                  </Text>
                  <Text variant="body4" color="$neutral2">
                    {tier.typicalPairs}
                  </Text>
                </Flex>
              </Flex>

              {/* Fee-range bar: the tier's band drawn on the shared 0% to 10% scale. */}
              <Flex
                grow
                shrink
                position="relative"
                height={6}
                borderRadius="$roundedFull"
                backgroundColor="$surface3"
                $md={{ display: 'none' }}
              >
                <Flex
                  position="absolute"
                  top={0}
                  bottom={0}
                  left={`${leftPct}%`}
                  width={`${widthPct}%`}
                  borderRadius="$roundedFull"
                  backgroundColor={accent}
                />
              </Flex>

              <Flex
                row
                alignItems="center"
                gap="$spacing6"
                width={FEE_COL_WIDTH}
                justifyContent="flex-end"
                shrink={false}
              >
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

        {/* Shared 0% to 10% scale for the bars above. */}
        <Flex row alignItems="center" gap="$spacing12" px="$spacing12" $md={{ display: 'none' }}>
          <Flex width={LABEL_COL_WIDTH} shrink={false} />
          <Flex grow row justifyContent="space-between">
            <Text variant="body4" color="$neutral3">
              0%
            </Text>
            <Text variant="body4" color="$neutral3">
              5%
            </Text>
            <Text variant="body4" color="$neutral3">
              10%
            </Text>
          </Flex>
          <Flex width={FEE_COL_WIDTH} shrink={false} />
        </Flex>
      </Flex>
    </Flex>
  )
}
