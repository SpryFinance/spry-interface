import { formatFeePercent, SpryZone } from '@spry/fee'
import { TradingApi } from '@universe/api'
import { Flex, Text, useSporeColors } from 'ui/src'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { TierIcon } from 'uniswap/src/features/transactions/swap/components/SpryFeeWidget/TierIcon'
import {
  useSpryPoolFeeStates,
  type SpryPoolFeeState,
} from 'uniswap/src/features/transactions/swap/components/SpryFeeWidget/useSpryPoolFeeStates'
import { useSwapFormStoreDerivedSwapInfo } from 'uniswap/src/features/transactions/swap/stores/swapFormStore/useSwapFormStore'
import { type Trade } from 'uniswap/src/features/transactions/swap/types/trade'
import { isClassic } from 'uniswap/src/features/transactions/swap/utils/routing'
import { CurrencyField } from 'uniswap/src/types/currency'

/** Curve-zone -> Spore status color (DANGER + CAP share critical; the fill level + label separate them). */
const ZONE_COLOR: Record<SpryZone, string> = {
  [SpryZone.SAFE]: '$statusSuccess',
  [SpryZone.ALERT]: '$statusWarning',
  [SpryZone.DANGER]: '$statusCritical',
  [SpryZone.CAP]: '$statusCritical',
}

/** Curve-zone -> a plain-language label for the fee's current heat. */
const ZONE_LABEL: Record<SpryZone, string> = {
  [SpryZone.SAFE]: 'Calm',
  [SpryZone.ALERT]: 'Elevated',
  [SpryZone.DANGER]: 'High',
  [SpryZone.CAP]: 'Capped',
}

/** Pool ids the live trade actually routed through (the router's best-price choice). */
function routePoolIds(trade: Trade | undefined): Set<string> {
  if (!trade || !isClassic(trade)) {
    return new Set()
  }
  const pools = trade.quote.quote.route?.[0] ?? []
  return new Set(
    pools.filter((pool): pool is TradingApi.V4PoolInRoute => pool.type === 'v4-pool').map((pool) => pool.address),
  )
}

/**
 * Surfaces the live Spry dynamic-fee state of the pool(s) the selected pair would
 * route through, in the swap form (Base Sepolia only). Each pool gets a card: its
 * tier (icon + label), current resting fee + curve zone, a gauge of how far the fee
 * sits between base and cap, and how long until the block window resets. A pair with
 * several fee tiers shows one card per tier; once an amount is entered, the tier the
 * router picks (best execution) is highlighted "Best". Renders nothing for non-Spry
 * pairs or other chains.
 */
export function SpryFeeWidget(): JSX.Element | null {
  const { chainId, currencies, trade } = useSwapFormStoreDerivedSwapInfo((s) => ({
    chainId: s.chainId,
    currencies: s.currencies,
    trade: s.trade,
  }))
  const states = useSpryPoolFeeStates({
    chainId,
    currencyIn: currencies[CurrencyField.INPUT]?.currency,
    currencyOut: currencies[CurrencyField.OUTPUT]?.currency,
  })

  if (chainId !== UniverseChainId.BaseSepolia || !states || states.length === 0) {
    return null
  }

  // Show each pool's own pair only when they differ (multi-hop). For one pair with
  // several tiers, the tier label already distinguishes the cards.
  const showPair = new Set(states.map((state) => state.pairLabel)).size > 1
  const bestPoolIds = routePoolIds(trade.trade)
  const pairTierCount = new Map<string, number>()
  for (const state of states) {
    pairTierCount.set(state.pairLabel, (pairTierCount.get(state.pairLabel) ?? 0) + 1)
  }

  return (
    <Flex backgroundColor="$surface2" borderRadius="$rounded16" p="$spacing12" gap="$spacing8">
      <Text color="$neutral2" variant="body3">
        Spry dynamic fee
      </Text>
      {states.map((state) => {
        // "Best" is only meaningful when the pair has more than one tier to choose
        // between AND the live quote actually routed through this one.
        const hasAlternatives = (pairTierCount.get(state.pairLabel) ?? 0) > 1
        const isBest = hasAlternatives && bestPoolIds.has(state.poolId)
        return <SpryFeeBar key={state.poolId} state={state} showPair={showPair} isBest={isBest} />
      })}
    </Flex>
  )
}

function SpryFeeBar({
  state,
  showPair,
  isBest,
}: {
  state: SpryPoolFeeState
  showPair: boolean
  isBest: boolean
}): JSX.Element {
  const sporeColors = useSporeColors()
  const span = state.capFeePips - state.baseFeePips
  const fillPercent =
    span > 0 ? Math.max(0, Math.min(100, ((state.currentFeePips - state.baseFeePips) / span) * 100)) : 0
  const zoneColor = ZONE_COLOR[state.zone]
  const windowText =
    state.blocksRemaining > 0
      ? `eases to base in ~${state.blocksRemaining} block${state.blocksRemaining === 1 ? '' : 's'}`
      : 'at base fee'

  return (
    <Flex
      gap="$spacing6"
      p="$spacing8"
      borderRadius="$rounded12"
      borderWidth={1}
      borderColor={isBest ? '$accent1' : 'transparent'}
    >
      <Flex row alignItems="center" justifyContent="space-between">
        <Flex row alignItems="center" gap="$spacing6">
          <TierIcon tier={state.tier} color={sporeColors.neutral2.val} />
          <Text color="$neutral2" variant="body3">
            {state.tierLabel.toUpperCase()}
          </Text>
          {showPair ? (
            <Text color="$neutral3" variant="body3">
              {`· ${state.pairLabel}`}
            </Text>
          ) : null}
          {isBest ? (
            <Text color="$accent1" variant="body4">
              Best
            </Text>
          ) : null}
        </Flex>
        <Flex row alignItems="center" gap="$spacing8">
          <Text color="$neutral1" variant="body3">
            {formatFeePercent(state.currentFeePips)}
          </Text>
          <Text color={zoneColor} variant="body3">
            {ZONE_LABEL[state.zone]}
          </Text>
        </Flex>
      </Flex>
      <Flex height={6} backgroundColor="$surface3" borderRadius="$roundedFull" overflow="hidden">
        <Flex height={6} width={`${fillPercent}%`} backgroundColor={zoneColor} borderRadius="$roundedFull" />
      </Flex>
      <Flex row alignItems="center" justifyContent="space-between">
        <Text color="$neutral3" variant="body4">
          {`${formatFeePercent(state.baseFeePips)} to ${formatFeePercent(state.capFeePips)}`}
        </Text>
        <Text color="$neutral3" variant="body4">
          {windowText}
        </Text>
      </Flex>
    </Flex>
  )
}
