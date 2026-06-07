import { GqlResult } from '@universe/api'
import { useMemo } from 'react'
import { TokenOption } from 'uniswap/src/components/lists/items/types'
import { useCommonTokensOptions } from 'uniswap/src/components/TokenSelector/hooks/useCommonTokensOptions'
import { useCurrencies } from 'uniswap/src/components/TokenSelector/hooks/useCurrencies'
import {
  currencyInfosToTokenOptions,
  useCurrencyInfosToTokenOptions,
} from 'uniswap/src/components/TokenSelector/hooks/useCurrencyInfosToTokenOptions'
import { type PortfolioBalancesResult } from 'uniswap/src/components/TokenSelector/hooks/usePortfolioBalancesForAddressById'
import { COMMON_BASES } from 'uniswap/src/constants/routing'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { currencyId } from 'uniswap/src/utils/currencyId'

export function useCommonTokensOptionsWithFallback({
  chainFilter,
  portfolioData,
}: {
  chainFilter: UniverseChainId | null
  portfolioData: PortfolioBalancesResult
}): GqlResult<TokenOption[] | undefined> {
  const { data, error, refetch, loading } = useCommonTokensOptions({ chainFilter, portfolioData })
  const commonBases = useMemo(
    () => (chainFilter ? currencyInfosToTokenOptions(COMMON_BASES[chainFilter]) : undefined),
    [chainFilter],
  )
  const commonBasesCurrencyIds = useMemo(
    () => commonBases?.map((token) => currencyId(token.currencyInfo.currency)).filter(Boolean) ?? [],
    [commonBases],
  )
  const { data: commonBasesCurrencies } = useCurrencies(commonBasesCurrencyIds)
  const commonBasesTokenOptions = useCurrencyInfosToTokenOptions({
    currencyInfos: commonBasesCurrencies,
    portfolioBalancesById: {},
  })

  // Fall back to the local COMMON_BASES when the primary common-tokens result is
  // empty OR undefined. For Base Sepolia the gateway-backed primary
  // (useAllCommonBaseCurrencies, filtered to the chain) yields no tokens, and `data`
  // can be undefined (not just []) - so guard with `!data?.length`, not `=== 0`.
  const shouldFallback = !data?.length && commonBases?.length

  // useCurrencies() re-resolves the common bases via the gateway (useTokenProjects),
  // which does not serve every chain. For gateway-unsupported chains (e.g. Base
  // Sepolia) that re-fetch is empty OR INCOMPLETE - it resolves only native ETH, not
  // the ERC20s (sptA/sptB/WETH). Prefer the gateway result only when it is at least as
  // complete as the local list; otherwise render the local COMMON_BASES (already
  // complete CurrencyInfos) so every entry appears.
  const fallbackTokenOptions =
    commonBasesTokenOptions && commonBasesTokenOptions.length >= (commonBases?.length ?? 0)
      ? commonBasesTokenOptions
      : commonBases

  return useMemo(
    () => ({
      data: shouldFallback ? fallbackTokenOptions : data,
      error: shouldFallback ? undefined : error,
      refetch,
      loading,
    }),
    [fallbackTokenOptions, data, error, loading, refetch, shouldFallback],
  )
}
