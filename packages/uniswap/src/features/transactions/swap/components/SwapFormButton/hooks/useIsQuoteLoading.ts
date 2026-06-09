import { useSwapFormStoreDerivedSwapInfo } from 'uniswap/src/features/transactions/swap/stores/swapFormStore/useSwapFormStore'
import { WrapType } from 'uniswap/src/features/transactions/types/wrap'

/**
 * SPRY: true while the quote for the current input is still being priced (the
 * debounce after typing, or the in-flight on-chain Quoter reads). Background
 * poll refreshes of an existing quote only set `isFetching`, not `isLoading`,
 * so they do not flip this on. Wraps are excluded: their 1:1 "quote" has no
 * price to fetch.
 */
export const useIsQuoteLoading = (): boolean => {
  const { trade, wrapType } = useSwapFormStoreDerivedSwapInfo((s) => ({
    trade: s.trade,
    wrapType: s.wrapType,
  }))
  return wrapType === WrapType.NotApplicable && trade.isLoading
}
