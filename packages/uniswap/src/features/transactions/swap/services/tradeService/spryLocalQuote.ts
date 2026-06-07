import { type DiscriminatedQuoteResponse, type UnwrapQuoteResponse, type WrapQuoteResponse, TradingApi } from '@universe/api'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { ValidatedTradeInput } from 'uniswap/src/features/transactions/swap/services/tradeService/transformations/buildQuoteRequest'
import { getWrapType } from 'uniswap/src/features/transactions/swap/utils/wrap'
import { WrapType } from 'uniswap/src/features/transactions/types/wrap'

/**
 * The Uniswap entry-gateway / Trading API does not serve Base Sepolia: every quote
 * request returns 401. For the Spry deployment we therefore synthesize quote
 * responses locally and feed them through the normal `transformQuoteToTrade`
 * pipeline, so the resulting trade objects are identical to real API responses.
 *
 * Wrap/unwrap (native ETH <-> WETH) is deterministic 1:1 and needs no chain reads,
 * so the response is built purely from the validated input. Returns null for any
 * non-wrap pair, so the caller falls through to the next quote source.
 */
export function buildSpryWrapQuote(validatedInput: ValidatedTradeInput): DiscriminatedQuoteResponse | null {
  // Scope strictly to Base Sepolia; every other chain keeps the real Trading API path.
  if (validatedInput.currencyIn.chainId !== UniverseChainId.BaseSepolia) {
    return null
  }

  const wrapType = getWrapType(validatedInput.currencyIn, validatedInput.currencyOut)
  if (wrapType === WrapType.NotApplicable) {
    return null
  }

  // Wrap/unwrap is strictly 1:1, so the input and output raw amounts are identical
  // regardless of exact-input vs exact-output. WrapTrade only reads these amounts.
  const amountRaw = validatedInput.amount.quotient.toString()
  const quote = {
    input: { amount: amountRaw },
    output: { amount: amountRaw },
  }

  if (wrapType === WrapType.Wrap) {
    const response: WrapQuoteResponse = {
      requestId: 'spry-local-wrap',
      routing: TradingApi.Routing.WRAP,
      permitData: null,
      quote,
    }
    return response
  }

  const response: UnwrapQuoteResponse = {
    requestId: 'spry-local-unwrap',
    routing: TradingApi.Routing.UNWRAP,
    permitData: null,
    quote,
  }
  return response
}
