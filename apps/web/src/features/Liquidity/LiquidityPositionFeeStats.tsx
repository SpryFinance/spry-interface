import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, styled, Text, useMedia } from 'ui/src'
import { ArrowDownArrowUp } from 'ui/src/components/icons/ArrowDownArrowUp'
import { PriceOrdering } from 'uniswap/src/features/positions/types'
import { MouseoverTooltip } from '~/components/Tooltip'
import { CHART_WIDTH } from '~/features/Liquidity/charts/LiquidityPositionRangeChart/LiquidityPositionRangeChart'
import { useGetRangeDisplay } from '~/features/Liquidity/hooks/useGetRangeDisplay/useGetRangeDisplay'
import { TextLoader } from '~/features/Liquidity/Loader'
import { ClickableTamaguiStyle } from '~/theme/components/styles'

// SPRY: the stats row is pair-denominated (no USD pricing on testnet) - Position and Fees show the
// two token amounts, APR shows "New pair" on testnets. The price-range column is dropped for Spry
// positions (always full-range; the zone history lives in the card header instead), so the three
// stats spread across the full row. The old USD/LP-incentive plumbing was removed with it.

interface LiquidityPositionFeeStatsProps extends LiquidityPositionMinMaxRangeProps {
  cardHovered: boolean
  /** Position size, one line per pair side, e.g. ["41.2K sptA", "2.4K sptB"]. */
  positionLines?: string[]
  /** Accrued fees, one line per NONZERO side; the +amount renders green, the symbol white. */
  feeLines?: Array<{ value: string; symbol: string }>
  /** Final APR display string ("New pair" on testnets). */
  formattedApr: string
  /** Hides the min/max price-range column (Spry positions are always full-range). */
  hideRangeColumn?: boolean
}

const PrimaryText = styled(Text, {
  color: '$neutral1',
  variant: 'body2',
})

const SecondaryText = styled(Text, {
  color: '$neutral2',
  variant: 'body3',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

function WrapChildrenForMediaSize({ children }: { children: React.ReactNode }) {
  const media = useMedia()
  const isMobile = media.sm

  if (isMobile) {
    return (
      <Flex row gap="$gap12">
        {children}
      </Flex>
    )
  }

  return <>{children}</>
}

function FeeStat({ children }: { children: React.ReactNode }) {
  return (
    <Flex flex={1} flexBasis={0} $sm={{ flexBasis: 'auto' }}>
      {children}
    </Flex>
  )
}

function FeeStatLoader() {
  return (
    <Flex gap="$gap4">
      <TextLoader variant="body3" width={40} />
      <TextLoader variant="body2" width={60} />
    </Flex>
  )
}

export function LiquidityPositionFeeStatsLoader() {
  return (
    <Flex row gap="$gap20" justifyContent="space-between" width="50%" $md={{ width: '100%' }}>
      <FeeStatLoader />
      <FeeStatLoader />
      <FeeStatLoader />
    </Flex>
  )
}

export function LiquidityPositionFeeStats({
  positionLines,
  feeLines,
  formattedApr,
  hideRangeColumn = false,
  priceOrdering,
  tickLower,
  tickUpper,
  tickSpacing,
  cardHovered,
  pricesInverted,
  setPricesInverted,
}: LiquidityPositionFeeStatsProps) {
  const { t } = useTranslation()

  return (
    <Flex
      row
      justifyContent="space-between"
      gap="$gap20"
      py="$spacing16"
      px="$spacing24"
      borderBottomLeftRadius="$rounded20"
      borderBottomRightRadius="$rounded20"
      backgroundColor={cardHovered ? '$surface2Hovered' : '$surface2'}
    >
      {/* SPRY: labels sit ABOVE their values; accrued fees stack one pair side per line. */}
      <Flex row gap="$gap20" grow $sm={{ row: false }}>
        <WrapChildrenForMediaSize>
          <FeeStat>
            <SecondaryText>{t('pool.position')}</SecondaryText>
            {positionLines && positionLines.length > 0 ? (
              positionLines.map((line) => <PrimaryText key={line}>{line}</PrimaryText>)
            ) : (
              <MouseoverTooltip text={t('position.valueUnavailable')} placement="top">
                <PrimaryText>-</PrimaryText>
              </MouseoverTooltip>
            )}
          </FeeStat>
          <FeeStat>
            <SecondaryText variant="body3" color="$neutral2">
              {t('common.fees')}
            </SecondaryText>
            {feeLines && feeLines.length > 0 ? (
              feeLines.map((line) => (
                <Flex key={`${line.value}-${line.symbol}`} row gap="$spacing4" alignItems="center">
                  <PrimaryText color="$statusSuccess">{line.value}</PrimaryText>
                  <PrimaryText>{line.symbol}</PrimaryText>
                </Flex>
              ))
            ) : (
              <PrimaryText>-</PrimaryText>
            )}
          </FeeStat>
        </WrapChildrenForMediaSize>
        <FeeStat>
          <SecondaryText variant="body3" color="$neutral2">
            {t('pool.apr')}
          </SecondaryText>
          <PrimaryText>{formattedApr}</PrimaryText>
        </FeeStat>
      </Flex>
      {!hideRangeColumn && (
        <Flex $md={{ display: 'none' }}>
          <MinMaxRange
            priceOrdering={priceOrdering}
            tickLower={tickLower}
            tickUpper={tickUpper}
            tickSpacing={tickSpacing}
            pricesInverted={pricesInverted}
            setPricesInverted={setPricesInverted}
          />
        </Flex>
      )}
    </Flex>
  )
}

interface LiquidityPositionMinMaxRangeProps {
  priceOrdering: PriceOrdering
  tickSpacing?: number
  tickLower?: number
  tickUpper?: number
  pricesInverted: boolean
  setPricesInverted: Dispatch<SetStateAction<boolean>>
}

export function MinMaxRange({
  priceOrdering,
  tickLower,
  tickUpper,
  tickSpacing,
  pricesInverted,
  setPricesInverted,
}: LiquidityPositionMinMaxRangeProps) {
  const { t } = useTranslation()

  const { maxPrice, minPrice, tokenASymbol, tokenBSymbol, isFullRange } = useGetRangeDisplay({
    priceOrdering,
    tickSpacing,
    tickLower,
    tickUpper,
    pricesInverted,
  })

  return (
    <Flex group="item" minWidth={224} alignSelf="flex-start" width={CHART_WIDTH} $md={{ width: '100%' }} height="100%">
      {priceOrdering.priceLower && priceOrdering.priceUpper && !isFullRange ? (
        <Flex
          gap="$gap4"
          $md={{ row: true, justifyContent: 'flex-start', gap: '$gap24', width: '100%' }}
          $sm={{ row: false, gap: '$gap4', width: '100%' }}
          justifyContent="center"
          height="100%"
        >
          <Flex row gap="$gap12" alignItems="center">
            <SecondaryText flexShrink={0}>{t('common.min')}</SecondaryText>
            <SecondaryText color="$neutral1">
              {minPrice} {tokenASymbol} / {tokenBSymbol}
            </SecondaryText>
          </Flex>
          <Flex row gap="$gap8" alignItems="center">
            <SecondaryText flexShrink={0}>{t('common.max')}</SecondaryText>
            <SecondaryText color="$neutral1" display="flex" alignItems="center" gap="$gap4">
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {maxPrice}
              </span>
              <span>
                {tokenASymbol} / {tokenBSymbol}
              </span>
            </SecondaryText>
            <Flex
              height="100%"
              justifyContent="center"
              onPress={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setPricesInverted((prevInverted) => !prevInverted)
              }}
              {...ClickableTamaguiStyle}
              display="none"
              $group-item-hover={{ display: 'flex' }}
            >
              <ArrowDownArrowUp color="$neutral2" size="$icon.16" rotate="90deg" />
            </Flex>
          </Flex>
        </Flex>
      ) : (
        <Flex grow height="100%">
          <SecondaryText>{t('common.fullRange')}</SecondaryText>
        </Flex>
      )}
    </Flex>
  )
}
