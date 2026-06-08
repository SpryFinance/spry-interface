import { GqlResult } from '@universe/api'
import { useMemo } from 'react'
import type { AddressGroup } from 'uniswap/src/features/accounts/store/types/AccountsState'
import { PortfolioBalance } from 'uniswap/src/features/dataApi/types'
import { usePortfolioBalances } from 'uniswap/src/features/portfolio/balances/hooks'
import { useSpryOnchainBalances } from 'uniswap/src/features/portfolio/balances/useSpryOnchainBalances'

export type PortfolioBalancesResult = GqlResult<Record<Address, PortfolioBalance> | undefined>

export function usePortfolioBalancesForAddressById(addresses: AddressGroup): PortfolioBalancesResult {
  const {
    data: portfolioBalancesById,
    error,
    refetch,
    loading,
  } = usePortfolioBalances({
    ...addresses,
    fetchPolicy: 'cache-first', // we want to avoid re-renders when token selector is opening
  })

  // SPRY: the portfolio gateway does not serve Base Sepolia, so the gateway result
  // is empty there. Merge in on-chain balances for the Spry token set so the token
  // selector's "Your tokens" list reflects what the address actually holds.
  const spryBalances = useSpryOnchainBalances(addresses.evmAddress)

  return useMemo(
    () => ({
      data:
        spryBalances && Object.keys(spryBalances).length > 0
          ? { ...portfolioBalancesById, ...spryBalances }
          : portfolioBalancesById,
      error,
      refetch,
      loading,
    }),
    [portfolioBalancesById, spryBalances, error, refetch, loading],
  )
}
