import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { useCallback, useMemo } from 'react'
import type { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { getPositionKey } from 'uniswap/src/features/positions/utils'
import { usePositionVisibilityCheck } from 'uniswap/src/features/visibility/hooks/usePositionVisibilityCheck'
import { useSpryWalletPositions } from '~/features/Liquidity/spry/useSpryWalletPositions'
import { usePendingLPTransactionsChangeListener } from '~/state/transactions/hooks'

// SPRY: positions come from the Spry subgraph + live chain reads
// (useSpryWalletPositions) instead of the Uniswap gateway ListPositions, which
// does not serve Base Sepolia. The gateway plumbing this replaced
// (uniswap/src/features/positions/hooks/useWalletPositions +
// useRequestPositionsForSavedPairs + parseRestPosition) can be restored from
// git history if a gateway-served mainnet ever needs it. Status/version
// filters are applied locally so toggling them never refetches; pagination is
// gone because the whole wallet arrives in one query.

export interface UseWalletPositionsWebParams {
  address: string | undefined
  chainFilter: UniverseChainId | null
  versionFilter: ProtocolVersion[]
  statusFilter: PositionStatus[]
}

export interface UseWalletPositionsWebResult {
  visiblePositions: PositionInfo[]
  hiddenPositions: PositionInfo[]
  isFetching: boolean
  isPlaceholderData: boolean
  hasNextPage: boolean
  isLoadingPositions: boolean
  hasErrorWithoutData: boolean
  refetch: () => void
  loadMorePositions: () => void
}

export function useWalletPositionsWeb({
  address,
  chainFilter,
  versionFilter,
  statusFilter,
}: UseWalletPositionsWebParams): UseWalletPositionsWebResult {
  const isPositionVisible = usePositionVisibilityCheck()

  const { positions, isLoading, isFetching, error, refetch } = useSpryWalletPositions({
    address,
    chainFilter,
  })

  const isLoadingPositions = !!address && isLoading
  const hasErrorWithoutData = !!error && positions.length === 0

  const { visiblePositions, hiddenPositions } = useMemo(() => {
    const dedupedById = new Map<string, PositionInfo>()
    for (const position of positions) {
      const matchesChain = !chainFilter || position.chainId === chainFilter
      const matchesStatus = statusFilter.includes(position.status)
      const matchesVersion = versionFilter.includes(position.version)
      if (!matchesChain || !matchesStatus || !matchesVersion) {
        continue
      }
      const key = getPositionKey(position)
      if (!dedupedById.has(key)) {
        dedupedById.set(key, position)
      }
    }

    const visible: PositionInfo[] = []
    const hidden: PositionInfo[] = []
    for (const position of dedupedById.values()) {
      const isVisible = isPositionVisible({
        poolId: position.poolId,
        tokenId: position.tokenId,
        chainId: position.chainId,
        isFlaggedSpam: position.isHidden,
      })
      if (isVisible) {
        visible.push(position)
      } else {
        hidden.push(position)
      }
    }

    return { visiblePositions: visible, hiddenPositions: hidden }
  }, [positions, chainFilter, statusFilter, versionFilter, isPositionVisible])

  usePendingLPTransactionsChangeListener(refetch)

  const loadMorePositions = useCallback(() => {
    // single-shot fetch; nothing to page
  }, [])

  return {
    visiblePositions,
    hiddenPositions,
    isFetching,
    isPlaceholderData: false,
    hasNextPage: false,
    isLoadingPositions,
    hasErrorWithoutData,
    refetch,
    loadMorePositions,
  }
}
