import { FetchError, TradingApi } from '@universe/api'
import type { TFunction } from 'i18next'
import { WarningAction, WarningLabel, WarningSeverity } from 'uniswap/src/components/modals/WarningModal/types'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { getSwapWarningFromError } from 'uniswap/src/features/transactions/swap/hooks/useSwapWarnings/getSwapWarningFromError'
import type { DerivedSwapInfo } from 'uniswap/src/features/transactions/swap/types/derivedSwapInfo'

const t = ((key: string) => key) as unknown as TFunction

// Same-chain pair (not a bridge), the Spry/Base Sepolia case.
const sameChainSwapInfo = {
  currencies: {
    input: { currency: { chainId: UniverseChainId.BaseSepolia } },
    output: { currency: { chainId: UniverseChainId.BaseSepolia } },
  },
} as unknown as DerivedSwapInfo

function fetch404(errorCode: string): FetchError {
  return new FetchError({ response: new Response(null, { status: 404 }), data: { errorCode } })
}

describe('getSwapWarningFromError', () => {
  it('maps 404 ResourceNotFound to the no-routes warning, with the verdict on the button', () => {
    const warning = getSwapWarningFromError({
      error: fetch404(TradingApi.Err404.errorCode.RESOURCE_NOT_FOUND),
      t,
      derivedSwapInfo: sameChainSwapInfo,
    })
    expect(warning.type).toBe(WarningLabel.NoRoutesError)
    expect(warning.action).toBe(WarningAction.DisableReview)
    expect(warning.severity).toBe(WarningSeverity.Low)
    expect(warning.title).toBe('swap.warning.noRoutesFound.title')
    expect(warning.buttonText).toBe('swap.warning.noRoutesFound.title')
    expect(warning.message).toBe('swap.warning.noRoutesFound.message')
  })

  it('maps 404 QuoteAmountTooLowError to the enter-larger-amount warning', () => {
    const warning = getSwapWarningFromError({
      error: fetch404(TradingApi.Err404.errorCode.QUOTE_AMOUNT_TOO_LOW_ERROR),
      t,
      derivedSwapInfo: sameChainSwapInfo,
    })
    expect(warning.type).toBe(WarningLabel.EnterLargerAmount)
    expect(warning.action).toBe(WarningAction.DisableReview)
  })

  it('maps a rate-limit FetchError to the rate-limit warning', () => {
    const warning = getSwapWarningFromError({
      error: new FetchError({ response: new Response(null, { status: 429 }) }),
      t,
      derivedSwapInfo: sameChainSwapInfo,
    })
    expect(warning.type).toBe(WarningLabel.RateLimit)
  })

  it('falls back to the generic router warning for unknown errors', () => {
    const warning = getSwapWarningFromError({
      error: new Error('boom'),
      t,
      derivedSwapInfo: sameChainSwapInfo,
    })
    expect(warning.type).toBe(WarningLabel.SwapRouterError)
    expect(warning.action).toBe(WarningAction.DisableReview)
  })
})
