import { FetchError } from '@universe/api'
import {
  getQuoteRefetchIntervalMs,
  NO_ROUTES_QUOTE_POLL_INTERVAL_MS,
} from 'uniswap/src/features/transactions/swap/hooks/useTrade/useTradeQuery'

describe('getQuoteRefetchIntervalMs', () => {
  const BASE_MS = 3000

  it('backs off after a 404 quote failure (no fillable route)', () => {
    const error = new FetchError({ response: new Response(null, { status: 404 }) })
    expect(getQuoteRefetchIntervalMs({ error, baseInterval: BASE_MS })).toBe(NO_ROUTES_QUOTE_POLL_INTERVAL_MS)
    expect(NO_ROUTES_QUOTE_POLL_INTERVAL_MS).toBeGreaterThan(BASE_MS)
  })

  it('keeps the chain cadence for non-404 fetch errors', () => {
    const error = new FetchError({ response: new Response(null, { status: 500 }) })
    expect(getQuoteRefetchIntervalMs({ error, baseInterval: BASE_MS })).toBe(BASE_MS)
  })

  it('keeps the chain cadence for generic errors and for no error', () => {
    expect(getQuoteRefetchIntervalMs({ error: new Error('rpc hiccup'), baseInterval: BASE_MS })).toBe(BASE_MS)
    expect(getQuoteRefetchIntervalMs({ error: null, baseInterval: BASE_MS })).toBe(BASE_MS)
  })

  it('invokes a randomized base interval function', () => {
    expect(getQuoteRefetchIntervalMs({ error: null, baseInterval: () => 1234 })).toBe(1234)
  })
})
