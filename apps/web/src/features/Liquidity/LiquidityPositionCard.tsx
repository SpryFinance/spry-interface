import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { CurrencyAmount, Currency } from '@uniswap/sdk-core'
import { memo, useMemo, useState } from 'react'
import { Flex, Shine, useIsTouchDevice, useMedia } from 'ui/src'
import { zIndexes } from 'ui/src/theme'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { PositionInfo } from 'uniswap/src/features/positions/types'
import { NumberType } from 'utilities/src/format/types'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  LiquidityPositionRangeChartLoader,
} from '~/features/Liquidity/charts/LiquidityPositionRangeChart/LiquidityPositionRangeChart'
import { WrappedLiquidityPositionSparkline } from '~/features/Liquidity/charts/LiquidityPositionSparkline'
import { LiquidityPositionDropdownMenu } from '~/features/Liquidity/LiquidityPositionDropdownMenu'
import {
  LiquidityPositionFeeStats,
  LiquidityPositionFeeStatsLoader,
  MinMaxRange,
} from '~/features/Liquidity/LiquidityPositionFeeStats'
import { LiquidityPositionInfo, LiquidityPositionInfoLoader } from '~/features/Liquidity/LiquidityPositionInfo'
import { SpryFeeSparkline } from '~/features/Liquidity/spry/SpryFeeSparkline'
import { getSpryPositionMeta } from '~/features/Liquidity/spry/useSpryWalletPositions'
import { getBaseAndQuoteCurrencies } from '~/features/Liquidity/utils/currency'
import { useHoverProps } from '~/hooks/useHoverProps'

export function LiquidityPositionCardLoader() {
  return (
    <Shine>
      <Flex
        p="$spacing24"
        gap="$spacing24"
        borderWidth="$spacing1"
        borderRadius="$rounded20"
        borderColor="$surface3"
        width="100%"
        overflow="hidden"
        $md={{ gap: '$gap20' }}
      >
        <Flex
          row
          alignItems="center"
          justifyContent="space-between"
          $md={{ row: false, alignItems: 'flex-start', gap: '$gap20' }}
        >
          <LiquidityPositionInfoLoader />
          <LiquidityPositionRangeChartLoader height={CHART_HEIGHT} width={CHART_WIDTH} position="relative" />
        </Flex>
        <LiquidityPositionFeeStatsLoader />
      </Flex>
    </Shine>
  )
}

export const LiquidityPositionCard = memo(function LiquidityPositionCard({
  liquidityPosition,
  showVisibilityOption,
  disabled = false,
  isVisible = true,
  readOnly = false,
}: {
  liquidityPosition: PositionInfo
  showVisibilityOption?: boolean
  showMigrateButton?: boolean
  disabled?: boolean
  isVisible?: boolean
  readOnly?: boolean
}) {
  const { formatCurrencyAmount, formatPercent } = useLocalizationContext()
  const isTouchDevice = useIsTouchDevice()
  const [priceInverted, setPriceInverted] = useState(false)

  const [hover, hoverProps] = useHoverProps()
  const media = useMedia()
  const isSmallScreen = media.sm

  const { fee0Amount, fee1Amount } = liquidityPosition
  const sdkPosition = liquidityPosition.version !== ProtocolVersion.V2 ? liquidityPosition.position : undefined
  const priceOrdering = useMemo(() => {
    if (!sdkPosition) {
      return {}
    }

    const token0 = sdkPosition.amount0.currency
    const token1 = sdkPosition.amount1.currency

    return {
      priceLower: sdkPosition.token0PriceLower,
      priceUpper: sdkPosition.token0PriceUpper,
      quote: token1,
      base: token0,
    }
  }, [sdkPosition])

  const { baseCurrency } = getBaseAndQuoteCurrencies(
    {
      TOKEN0: liquidityPosition.currency0Amount.currency,
      TOKEN1: liquidityPosition.currency1Amount.currency,
    },
    priceInverted,
  )

  // SPRY: no USD pricing on testnet, so Position and Fees are pair-denominated (fees carry a "+"
  // per side), APR reads "New pair" on testnet chains, and the price range gives way to the pool's
  // fee-curve zone history (Spry positions are always full-range).
  const spryMeta = getSpryPositionMeta(liquidityPosition)
  const isTestnetChain = getChainInfo(liquidityPosition.chainId).testnet

  const pairAmount = (amount: CurrencyAmount<Currency>, prefix = ''): string =>
    `${prefix}${formatCurrencyAmount({ value: amount, type: NumberType.TokenNonTx })} ${amount.currency.symbol}`

  const formattedValue = `${pairAmount(liquidityPosition.currency0Amount)} / ${pairAmount(liquidityPosition.currency1Amount)}`
  // one line per pair side, zero sides skipped entirely
  const feeLines = [fee0Amount, fee1Amount]
    .filter((amount): amount is CurrencyAmount<Currency> => !!amount && amount.quotient.toString() !== '0')
    .map((amount) => pairAmount(amount, '+'))
  const formattedApr = isTestnetChain
    ? 'New pair'
    : liquidityPosition.apr
      ? formatPercent(liquidityPosition.apr)
      : '-'

  const priceOrderingForChart = useMemo(() => {
    if (!sdkPosition || !liquidityPosition.liquidity || !liquidityPosition.tickLower || !liquidityPosition.tickUpper) {
      return {}
    }
    return {
      base: baseCurrency,
      priceLower: priceInverted ? sdkPosition.token0PriceUpper.invert() : sdkPosition.token0PriceLower,
      priceUpper: priceInverted ? sdkPosition.token0PriceLower.invert() : sdkPosition.token0PriceUpper,
    }
  }, [
    sdkPosition,
    liquidityPosition.liquidity,
    liquidityPosition.tickLower,
    liquidityPosition.tickUpper,
    baseCurrency,
    priceInverted,
  ])

  return (
    <>
      <Flex
        {...hoverProps}
        group
        position="relative"
        gap="$spacing16"
        borderWidth="$spacing1"
        borderRadius="$rounded20"
        borderColor="$surface3"
        width="100%"
        hoverStyle={!disabled ? { borderColor: '$surface3Hovered', backgroundColor: '$surface1Hovered' } : {}}
      >
        <Flex
          row
          pt="$spacing24"
          px="$spacing24"
          alignItems="center"
          justifyContent="space-between"
          overflow="hidden"
          $md={{ row: false, alignItems: 'flex-start', gap: '$gap20' }}
        >
          <LiquidityPositionInfo positionInfo={liquidityPosition} isMiniVersion={isSmallScreen} />
          {spryMeta ? (
            // SPRY: the gateway price history behind the stock sparkline is empty on testnet, so
            // Spry pools plot their dynamic fee across recent swaps instead.
            <SpryFeeSparkline
              poolId={liquidityPosition.poolId}
              chainId={liquidityPosition.chainId}
              tier={spryMeta.tier}
              positionStatus={liquidityPosition.status}
            />
          ) : (
            <WrappedLiquidityPositionSparkline
              version={liquidityPosition.version}
              chainId={liquidityPosition.chainId}
              priceInverted={priceInverted}
              positionStatus={liquidityPosition.status}
              poolAddressOrId={liquidityPosition.poolId}
              priceOrdering={priceOrderingForChart}
            />
          )}
          {!spryMeta && (
            <Flex $md={{ display: 'block' }} display="none" width="100%">
              <MinMaxRange
                priceOrdering={priceOrdering}
                tickLower={liquidityPosition.tickLower}
                tickUpper={liquidityPosition.tickUpper}
                tickSpacing={liquidityPosition.tickSpacing}
                pricesInverted={priceInverted}
                setPricesInverted={setPriceInverted}
              />
            </Flex>
          )}
        </Flex>
        <LiquidityPositionFeeStats
          formattedValue={formattedValue}
          feeLines={feeLines}
          formattedApr={formattedApr}
          hideRangeColumn={!!spryMeta}
          priceOrdering={priceOrdering}
          tickSpacing={liquidityPosition.tickSpacing}
          tickLower={liquidityPosition.tickLower}
          tickUpper={liquidityPosition.tickUpper}
          cardHovered={hover && !disabled}
          pricesInverted={priceInverted}
          setPricesInverted={setPriceInverted}
        />
        {!isTouchDevice && !disabled && (
          <Flex position="absolute" top="$spacing16" right="$spacing16" zIndex={zIndexes.mask}>
            <LiquidityPositionDropdownMenu
              showVisibilityOption={showVisibilityOption}
              liquidityPosition={liquidityPosition}
              isVisible={isVisible}
              readOnly={readOnly}
            />
          </Flex>
        )}
      </Flex>
    </>
  )
})
