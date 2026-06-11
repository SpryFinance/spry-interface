import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { useCallback, useState } from 'react'
import { Flex } from 'ui/src'
import type { UniverseChainId } from 'uniswap/src/features/chains/types'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { DisconnectedWalletView } from '~/features/Liquidity/components/emptyStates/DisconnectedWalletView'
import { EmptyPositionsView } from '~/features/Liquidity/components/emptyStates/EmptyPositionsView'
import { ErrorPositionsView } from '~/features/Liquidity/components/emptyStates/ErrorPositionsView'
import { useWalletPositionsWeb } from '~/features/Liquidity/hooks/useWalletPositionsWeb'
import { LiquidityPositionCardLoader } from '~/features/Liquidity/LiquidityPositionCard'
import { PositionsHeader } from '~/features/Liquidity/PositionsHeader'
import { PositionsListSection } from '~/features/Liquidity/PositionsListSection'
import { SpryTierCurveChart } from '~/features/Liquidity/SpryTierCurveChart'
import { SpryTiersCard } from '~/features/Liquidity/SpryTiersCard'
import { useAccount } from '~/hooks/useAccount'
import { ClosedPositionsCTA } from '~/pages/Positions/components/ClosedPositionsCTA'
// SPRY: the "Learn about liquidity provision" sidebar is replaced for the testnet phase by the
// SpryTierCurveChart (a comparison of the five tier fee curves), shown beside the fee-tier card on
// desktop and stacked below on narrow screens. Restore the import + <PositionsSidebar> render below to
// bring the original sidebar back.
// import { PositionsSidebar } from '~/pages/Positions/components/PositionsSidebar'
import { usePositionFilters } from '~/pages/Positions/hooks/usePositionFilters'
import { useCreatePositionHref } from '~/utils/createPositionRoute'

export function Pool() {
  const account = useAccount()
  const { address, isConnected } = account

  const newPositionHref = useCreatePositionHref()

  const { chainFilter, setChainFilter, versionFilter, toggleVersion, statusFilter, toggleStatus } = usePositionFilters()
  const [showHiddenPositions, setShowHiddenPositions] = useState(false)

  const handleChainChange = useCallback(
    (selectedChain: UniverseChainId | null) => {
      setChainFilter(selectedChain)
    },
    [setChainFilter],
  )

  const {
    visiblePositions,
    hiddenPositions,
    isFetching,
    isPlaceholderData,
    hasNextPage,
    isLoadingPositions,
    hasErrorWithoutData,
    refetch,
    loadMorePositions,
  } = useWalletPositionsWeb({
    address,
    chainFilter,
    versionFilter,
    statusFilter,
  })

  return (
    <Trace logImpression page={InterfacePageName.Positions}>
      <Flex
        row
        justifyContent="space-between"
        // SPRY: top-align so the fee-curve chart in the right column lines up with the fee-tier card.
        alignItems="flex-start"
        $xl={{ flexDirection: 'column', gap: '$gap16' }}
        width="100%"
        gap={20}
        py="$spacing24"
        px="$spacing40"
        $lg={{ px: '$spacing20' }}
      >
        <Flex grow shrink gap="$spacing24" maxWidth={740} $xl={{ maxWidth: '100%' }}>
          {/* SPRY: Uniswap's LP-incentives (UNI rewards) card is replaced by the Spry fee-tier explainer (no reward token yet). */}
          <SpryTiersCard />
          <Flex row justifyContent="space-between" alignItems="center">
            <PositionsHeader
              showFilters={account.isConnected}
              selectedChain={chainFilter}
              selectedVersions={versionFilter}
              selectedStatus={statusFilter}
              onChainChange={handleChainChange}
              onVersionChange={toggleVersion}
              onStatusChange={toggleStatus}
            />
          </Flex>
          {hasErrorWithoutData && isConnected ? (
            <ErrorPositionsView onRetry={refetch} />
          ) : !isLoadingPositions ? (
            visiblePositions.length > 0 || hiddenPositions.length > 0 ? (
              <PositionsListSection
                visiblePositions={visiblePositions}
                hiddenPositions={hiddenPositions}
                hasNextPage={hasNextPage}
                isFetching={isFetching}
                isPlaceholderData={isPlaceholderData}
                loadMorePositions={loadMorePositions}
                showHiddenPositions={showHiddenPositions}
                setShowHiddenPositions={setShowHiddenPositions}
                hiddenSectionPadding={{ py: '$spacing12', px: 0 }}
              />
            ) : isConnected ? (
              <EmptyPositionsView newPositionHref={newPositionHref} withBorder />
            ) : (
              <DisconnectedWalletView />
            )
          ) : (
            <Flex gap="$gap16">
              {Array.from({ length: 5 }, (_, index) => (
                <LiquidityPositionCardLoader key={index} />
              ))}
            </Flex>
          )}
          <ClosedPositionsCTA show={!statusFilter.includes(PositionStatus.CLOSED) && !!account.address} />
        </Flex>
        {/* SPRY: fee-curve comparison replaces the "Learn about liquidity provision" sidebar. Restore:
            <PositionsSidebar chainFilter={chainFilter} isConnected={isConnected} /> (+ the import above). */}
        <Flex width={360} $xl={{ width: '100%' }}>
          <SpryTierCurveChart />
        </Flex>
      </Flex>
    </Trace>
  )
}

export default Pool
