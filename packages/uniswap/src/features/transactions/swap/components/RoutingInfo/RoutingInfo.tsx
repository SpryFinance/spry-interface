import type { GasFeeResult } from '@universe/api'
import type { UniverseChainId } from 'uniswap/src/features/chains/types'
import { PlanRoutingInfo } from 'uniswap/src/features/transactions/swap/components/RoutingInfo/ChainedRoutingInfo'
import { RoutingHopInfo } from 'uniswap/src/features/transactions/swap/components/RoutingInfo/RoutingHopInfo'
import { Trade } from 'uniswap/src/features/transactions/swap/types/trade'
import { isChained } from 'uniswap/src/features/transactions/swap/utils/routing'

/**
 * Component that displays the routing information for a given trade for different routing types
 * as a row in the swap details. Component may also show tooltips or modals with more information.
 */
export function RoutingInfo({
  trade,
  chainId,
  gasFee,
}: {
  trade: Trade
  chainId: UniverseChainId
  gasFee: GasFeeResult
}): JSX.Element | null {
  if (isChained(trade)) {
    return <PlanRoutingInfo trade={trade} />
  }

  return <RoutingHopInfo trade={trade} chainId={chainId} gasFee={gasFee} />
}
