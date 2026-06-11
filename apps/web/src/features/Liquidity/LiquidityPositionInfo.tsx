import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Anchor, Circle, Flex, Text, useMedia } from 'ui/src'
import { StatusIndicatorCircle } from 'ui/src/components/icons/StatusIndicatorCircle'
import { NetworkLogo } from 'uniswap/src/components/CurrencyLogo/NetworkLogo'
import { SplitLogo } from 'uniswap/src/components/CurrencyLogo/SplitLogo'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { LiquidityPositionStatusIndicator } from 'uniswap/src/features/positions/LiquidityPositionStatusIndicator'
import { PositionInfo } from 'uniswap/src/features/positions/types'
import { useCurrencyInfos } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { currencyId } from 'uniswap/src/utils/currencyId'
import { getPoolDetailsURL } from 'uniswap/src/utils/linking'
import { MouseoverTooltip } from '~/components/Tooltip'
import { TextLoader } from '~/features/Liquidity/Loader'
import { LpIncentivesAprDisplay } from '~/features/Liquidity/LPIncentives/LpIncentivesAprDisplay'
import { getSpryPositionMeta } from '~/features/Liquidity/spry/useSpryWalletPositions'
import { SpryTierBadge } from '~/features/Liquidity/spry/SpryTierBadge'
import { getProtocolStatusLabel } from '~/features/Liquidity/utils/protocolVersion'
import { ClickableTamaguiStyle } from '~/theme/components/styles'

function LiquidityPositionStatusIndicatorLoader() {
  return (
    <Flex row gap="$spacing6" alignItems="center">
      <StatusIndicatorCircle color="$surface3" />
      <TextLoader variant="body3" width={100} />
    </Flex>
  )
}

interface LiquidityPositionInfoProps {
  positionInfo: PositionInfo
  currencyLogoSize?: number
  hideStatusIndicator?: boolean
  isMiniVersion?: boolean
  linkToPool?: boolean
  includeLpIncentives?: boolean
  includeNetwork?: boolean
  lpIncentiveRewardApr?: number
}

export function LiquidityPositionInfoLoader({ hideStatus }: { hideStatus?: boolean }) {
  return (
    <Flex row gap="$gap16" $md={{ width: '100%' }}>
      <Circle size={44} backgroundColor="$surface3" />
      <Flex grow $md={{ row: true, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Flex my={hideStatus ? 'auto' : '$none'}>
          <TextLoader variant="subheading1" width={100} />
        </Flex>
        {!hideStatus && <LiquidityPositionStatusIndicatorLoader />}
      </Flex>
    </Flex>
  )
}

/** "In Pool" green, "Closed" muted (mirrors the status-indicator palette). */
function statusColor(status: PositionStatus): '$statusSuccess' | '$neutral2' {
  return status === PositionStatus.CLOSED ? '$neutral2' : '$statusSuccess'
}

/**
 * SPRY: compact fee-curve zone history - swaps that pushed the dynamic fee into
 * the alert / danger zones, zone-colored, details on hover. Sits directly under
 * the "In Pool"/"Closed" label.
 */
function SpryZoneCounts({ alertCount, dangerCount }: { alertCount: number; dangerCount: number }) {
  return (
    <MouseoverTooltip
      text={`Swaps that pushed this pool's dynamic fee into the Alert zone: ${alertCount}, into the Danger zone: ${dangerCount}. The fee climbs through these zones with volatility and imbalance, then eases back toward the tier's base.`}
      placement="top"
    >
      <Flex row gap="$spacing6" alignItems="center" cursor="help">
        <Text variant="body3" color="$statusWarning">
          {alertCount}
        </Text>
        <Text variant="body3" color="$statusCritical">
          {dangerCount}
        </Text>
      </Flex>
    </MouseoverTooltip>
  )
}

function PairNameText({ positionInfo, linkToPool }: { positionInfo: PositionInfo; linkToPool: boolean }) {
  const pair = `${positionInfo.currency0Amount.currency.symbol} / ${positionInfo.currency1Amount.currency.symbol}`
  if (linkToPool) {
    return (
      <Anchor href={getPoolDetailsURL(positionInfo.poolId, positionInfo.chainId)} textDecorationLine="none">
        <Text variant="subheading1" {...ClickableTamaguiStyle}>
          {pair}
        </Text>
      </Anchor>
    )
  }
  return <Text variant="subheading1">{pair}</Text>
}

export function LiquidityPositionInfo({
  positionInfo,
  currencyLogoSize = 44,
  hideStatusIndicator = false,
  isMiniVersion = false,
  linkToPool = false,
  includeLpIncentives = false,
  includeNetwork = false,
}: LiquidityPositionInfoProps) {
  const { currency0Amount, currency1Amount, status, chainId } = positionInfo
  const chainInfo = getChainInfo(positionInfo.chainId)
  const media = useMedia()
  const { t } = useTranslation()
  const lpIncentiveRewardApr =
    positionInfo.version === ProtocolVersion.V4 && Boolean(positionInfo.boostedApr)
      ? positionInfo.boostedApr
      : undefined

  // SPRY: the v4 / hook-address / Dynamic chips (LiquidityPositionInfoBadges) are removed - every Spry
  // position is v4 + SpryHook + dynamic, so the chips said nothing. The pair name carries the status
  // label instead, and the tier badge below replaces the in/out-of-range indicator (positions are
  // full-range, so "range" status is meaningless; the tier is what differentiates pools).
  const spryMeta = getSpryPositionMeta(positionInfo)
  const statusLabel = getProtocolStatusLabel(status, t)

  const [currency0Info, currency1Info] = useCurrencyInfos([
    currencyId(currency0Amount.currency),
    currencyId(currency1Amount.currency),
  ])

  const includeNetworkInLogo = useMemo(() => !includeNetwork || media.lg, [includeNetwork, media.lg])

  return (
    <Flex row gap="$gap16" $md={{ width: '100%' }} alignItems={isMiniVersion ? 'center' : 'flex-start'} minWidth={0}>
      <SplitLogo
        inputCurrencyInfo={currency0Info}
        outputCurrencyInfo={currency1Info}
        size={currencyLogoSize}
        chainId={includeNetworkInLogo ? chainId : null}
      />
      <Flex gap={isMiniVersion ? '$none' : '$spacing2'}>
        {/* SPRY: two aligned columns - (pair name over tier badge) beside (status over zone counts) -
            so the zone numbers sit exactly under the "In Pool"/"Closed" label. */}
        <Flex
          flexDirection={isMiniVersion ? 'column' : 'row'}
          gap={isMiniVersion ? '$none' : '$gap12'}
          $md={{ gap: isMiniVersion ? '$none' : '$gap12' }}
          alignItems="flex-start"
        >
          <Flex gap="$spacing2">
            <PairNameText positionInfo={positionInfo} linkToPool={linkToPool} />
            {!isMiniVersion &&
              !hideStatusIndicator &&
              (spryMeta ? (
                <SpryTierBadge tier={spryMeta.tier} />
              ) : (
                <Flex row gap="$spacing6" alignItems="center">
                  <LiquidityPositionStatusIndicator status={status} />
                </Flex>
              ))}
          </Flex>
          <Flex gap="$spacing2" justifyContent="space-between" alignSelf="stretch" py="$spacing2">
            {statusLabel && (
              <Text variant="body3" color={statusColor(status)}>
                {statusLabel}
              </Text>
            )}
            {!isMiniVersion && !hideStatusIndicator && spryMeta && (
              <SpryZoneCounts alertCount={spryMeta.alertCount} dangerCount={spryMeta.dangerCount} />
            )}
          </Flex>
        </Flex>

        {!isMiniVersion && (includeNetwork || (includeLpIncentives && lpIncentiveRewardApr)) && (
          <Flex row gap="$gap12">
            {includeNetwork && (
              <Flex row gap="$spacing6" alignItems="center" $lg={{ display: 'none' }}>
                <NetworkLogo chainId={chainInfo.id} size={16} shape="square" />
                <Text variant="body3" color="$neutral2">
                  {chainInfo.name}
                </Text>
              </Flex>
            )}
            {includeLpIncentives && lpIncentiveRewardApr && (
              <LpIncentivesAprDisplay
                lpIncentiveRewardApr={lpIncentiveRewardApr}
                hideBackground
                tooltipProps={{
                  currency0Info,
                  currency1Info,
                  poolApr: positionInfo.apr,
                  totalApr: positionInfo.version === ProtocolVersion.V4 ? positionInfo.totalApr : undefined,
                }}
              />
            )}
          </Flex>
        )}
      </Flex>
    </Flex>
  )
}
