import { isSpryChain } from '@spry/config'
import { GqlResult } from '@universe/api'
import { isMobileApp } from '@universe/environment'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { memo, useCallback, useMemo, useRef } from 'react'
import { Flex } from 'ui/src'
import { TokenSelectorOption } from 'uniswap/src/components/lists/items/types'
import { type OnchainItemSection, OnchainItemSectionName } from 'uniswap/src/components/lists/OnchainItemList/types'
import { SectionHeader } from 'uniswap/src/components/lists/SectionHeader'
import { useOnchainItemListSection } from 'uniswap/src/components/lists/utils'
import { useCommonTokensOptionsWithFallback } from 'uniswap/src/components/TokenSelector/hooks/useCommonTokensOptionsWithFallback'
import { useFavoriteTokensOptions } from 'uniswap/src/components/TokenSelector/hooks/useFavoriteTokensOptions'
import { usePortfolioBalancesForAddressById } from 'uniswap/src/components/TokenSelector/hooks/usePortfolioBalancesForAddressById'
import { usePortfolioTokenOptions } from 'uniswap/src/components/TokenSelector/hooks/usePortfolioTokenOptions'
import { useRecentlySearchedTokens } from 'uniswap/src/components/TokenSelector/hooks/useRecentlySearchedTokens'
import { useTrendingTokensOptions } from 'uniswap/src/components/TokenSelector/hooks/useTrendingTokensOptions'
import { TokenSelectorList } from 'uniswap/src/components/TokenSelector/TokenSelectorList'
import { OnSelectCurrency, TokenSectionsHookProps } from 'uniswap/src/components/TokenSelector/types'
import { isSwapListLoading } from 'uniswap/src/components/TokenSelector/utils'
import { useBridgingTokensOptions } from 'uniswap/src/features/bridging/hooks/tokens'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { isBackendSupportedChainId } from 'uniswap/src/features/chains/utils'
import { DataApiOutageBanner } from 'uniswap/src/features/dataApi/outage/DataApiOutageBanner'
import { ClearRecentSearchesButton } from 'uniswap/src/features/search/ClearRecentSearchesButton'

// Matches the default 40px section header plus the single-line outage banner and spacing on web.
const PORTFOLIO_OUTAGE_SECTION_HEADER_ROW_HEIGHT = 104

/**
 * A portfolio outage is real only when the data API actually serves the chain.
 * SPRY: on a gateway-unsupported chain the API never returns token prices, so its
 * error is expected - not an outage - and the "Cannot load latest token prices"
 * banner must not show. Extracted so the gateway guard does not push
 * useTokenSectionsForSwap past its complexity ceiling.
 */
function getIsPortfolioOutage(args: {
  isGatewayUnsupportedChain: boolean
  portfolioTokenOptions: unknown
  portfolioTokenOptionsError: unknown
}): boolean {
  return !args.isGatewayUnsupportedChain && !!args.portfolioTokenOptions && !!args.portfolioTokenOptionsError
}

function useTokenSectionsForSwap({
  addresses,
  chainFilter,
  oppositeSelectedToken,
}: TokenSectionsHookProps): GqlResult<OnchainItemSection<TokenSelectorOption>[]> {
  const { defaultChainId, isTestnetModeEnabled } = useEnabledChains()
  const multichainTokenUxEnabled = useFeatureFlag(FeatureFlags.MultichainTokenUx)

  // Fetch portfolio balances once and share across all sub-hooks to avoid 5 redundant hook chain traversals
  const portfolioData = usePortfolioBalancesForAddressById(addresses)

  const {
    data: portfolioTokenOptions,
    error: portfolioTokenOptionsError,
    refetch: refetchPortfolioTokenOptions,
    loading: portfolioTokenOptionsLoading,
  } = usePortfolioTokenOptions({ chainFilter, portfolioData })

  const {
    data: trendingTokenOptions,
    error: trendingTokenOptionsError,
    refetch: refetchTrendingTokenOptions,
    loading: trendingTokenOptionsLoading,
  } = useTrendingTokensOptions({ chainFilter, portfolioData })

  const {
    data: favoriteTokenOptions,
    error: favoriteTokenOptionsError,
    refetch: refetchFavoriteTokenOptions,
    loading: favoriteTokenOptionsLoading,
  } = useFavoriteTokensOptions({ chainFilter, portfolioData })

  const {
    data: commonTokenOptions,
    error: commonTokenOptionsError,
    refetch: refetchCommonTokenOptions,
    loading: commonTokenOptionsLoading,
    // if there is no chain filter, first check if the input token has a chainId, fallback to defaultChainId
  } = useCommonTokensOptionsWithFallback({
    chainFilter: chainFilter ?? oppositeSelectedToken?.chainId ?? defaultChainId,
    portfolioData,
  })

  const {
    data: bridgingTokenOptions,
    error: bridgingTokenOptionsError,
    refetch: refetchBridgingTokenOptions,
    loading: bridgingTokenOptionsLoading,
    shouldNest: shouldNestBridgingTokens,
  } = useBridgingTokensOptions({ oppositeSelectedToken, chainFilter, portfolioData })

  const recentlySearchedTokenOptions = useRecentlySearchedTokens(chainFilter)

  // A Spry chain is not reachable by the Uniswap gateway, so its portfolio /
  // trending / bridging endpoints 400/401. Those are expected, not fatal - suppress
  // them so the locally-sourced suggested tokens (COMMON_BASES) still render instead
  // of "Something went wrong". NOTE: some Spry chains (e.g. Unichain Sepolia) report
  // backendSupported: true, so isBackendSupportedChainId alone is not enough - also
  // treat every Spry chain as gateway-unsupported (this is what kept the "Cannot load
  // latest token prices" banner showing on Unichain Sepolia).
  const effectiveChainId = chainFilter ?? oppositeSelectedToken?.chainId ?? defaultChainId
  const isGatewayUnsupportedChain = !isBackendSupportedChainId(effectiveChainId) || isSpryChain(effectiveChainId)

  const error = isGatewayUnsupportedChain
    ? undefined
    : (!portfolioTokenOptions && portfolioTokenOptionsError) ||
      (!trendingTokenOptions && trendingTokenOptionsError) ||
      (!multichainTokenUxEnabled && !favoriteTokenOptions && favoriteTokenOptionsError) ||
      (!commonTokenOptions && commonTokenOptionsError) ||
      (!bridgingTokenOptions && bridgingTokenOptionsError)

  const loading =
    (!portfolioTokenOptions && portfolioTokenOptionsLoading) ||
    (!trendingTokenOptions && trendingTokenOptionsLoading) ||
    (!multichainTokenUxEnabled && !favoriteTokenOptions && favoriteTokenOptionsLoading) ||
    (!commonTokenOptions && commonTokenOptionsLoading) ||
    (!bridgingTokenOptions && bridgingTokenOptionsLoading)

  const refetchAllRef = useRef<() => void>(() => {})

  refetchAllRef.current = (): void => {
    refetchPortfolioTokenOptions?.()
    refetchTrendingTokenOptions?.()
    refetchFavoriteTokenOptions?.()
    refetchCommonTokenOptions?.()
    refetchBridgingTokenOptions?.()
  }

  const refetch = useCallback(() => {
    refetchAllRef.current()
  }, [])

  // we draw the Suggested pills as a single item of a section list, so `data` is TokenOption[][]

  const suggestedSectionOptions = useMemo(() => [commonTokenOptions ?? []], [commonTokenOptions])
  const suggestedSection = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.SuggestedTokens,
    options: suggestedSectionOptions,
  })

  const isPortfolioOutage = getIsPortfolioOutage({
    isGatewayUnsupportedChain,
    portfolioTokenOptions,
    portfolioTokenOptionsError,
  })

  const portfolioOutageSectionHeader = useMemo(() => {
    if (!isPortfolioOutage) {
      return undefined
    }
    return (
      <Flex backgroundColor="$surface1" width="100%">
        <SectionHeader sectionKey={OnchainItemSectionName.YourTokens} />
        <Flex backgroundColor="$surface1" px="$spacing8" pt="$spacing8">
          <DataApiOutageBanner />
        </Flex>
      </Flex>
    )
  }, [isPortfolioOutage])

  const portfolioSection = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.YourTokens,
    options: portfolioTokenOptions,
    sectionHeader: portfolioOutageSectionHeader,
    sectionHeaderHeight: isPortfolioOutage ? PORTFOLIO_OUTAGE_SECTION_HEADER_ROW_HEIGHT : undefined,
  })

  const memoizedEndElement = useMemo(() => <ClearRecentSearchesButton />, [])
  const recentSection = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.RecentSearches,
    options: recentlySearchedTokenOptions,
    endElement: memoizedEndElement,
  })

  const favoriteSection = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.FavoriteTokens,
    options: favoriteTokenOptions,
  })

  const trendingSection = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.TrendingTokens,
    options: trendingTokenOptions,
  })

  const bridgingSectionTokenOptions: TokenSelectorOption[] = useMemo(
    () => (shouldNestBridgingTokens ? [bridgingTokenOptions ?? []] : (bridgingTokenOptions ?? [])),
    [bridgingTokenOptions, shouldNestBridgingTokens],
  )

  const bridgingSection = useOnchainItemListSection({
    sectionKey: OnchainItemSectionName.BridgingTokens,
    options: bridgingSectionTokenOptions,
  })

  const sections = useMemo(() => {
    if (isSwapListLoading({ loading, portfolioSection, trendingSection, isTestnetModeEnabled })) {
      return undefined
    }

    if (isTestnetModeEnabled) {
      return [...(suggestedSection ?? []), ...(portfolioSection ?? [])]
    }

    return [
      ...(suggestedSection ?? []),
      ...(bridgingSection ?? []),
      ...(portfolioSection ?? []),
      ...(recentSection ?? []),
      // TODO(WEB-3061): Favorited wallets/tokens
      // Extension & interface do not support favoriting but has a default list, so we can't rely on empty array check
      ...(isMobileApp && !multichainTokenUxEnabled ? (favoriteSection ?? []) : []),
      ...(trendingSection ?? []),
    ]
  }, [
    loading,
    portfolioSection,
    trendingSection,
    suggestedSection,
    bridgingSection,
    recentSection,
    favoriteSection,
    isTestnetModeEnabled,
    multichainTokenUxEnabled,
  ])

  return useMemo(
    () => ({
      data: sections,
      loading,
      error: error || undefined,
      refetch,
    }),
    [error, loading, refetch, sections],
  )
}

function TokenSelectorSwapListInner({
  onSelectCurrency,
  addresses,
  chainFilter,
  oppositeSelectedToken,
  renderedInModal,
}: TokenSectionsHookProps & {
  onSelectCurrency: OnSelectCurrency
  chainFilter: UniverseChainId | null
  renderedInModal: boolean
}): JSX.Element {
  const {
    data: sections,
    loading,
    error,
    refetch,
  } = useTokenSectionsForSwap({
    addresses,
    chainFilter,
    oppositeSelectedToken,
  })

  const hasError = Boolean(error)

  return (
    <Flex grow>
      <TokenSelectorList
        showTokenAddress
        chainFilter={chainFilter}
        hasError={hasError}
        loading={loading}
        refetch={refetch}
        sections={sections}
        showTokenWarnings={true}
        renderedInModal={renderedInModal}
        onSelectCurrency={onSelectCurrency}
      />
    </Flex>
  )
}

export const TokenSelectorSwapList = memo(TokenSelectorSwapListInner)
