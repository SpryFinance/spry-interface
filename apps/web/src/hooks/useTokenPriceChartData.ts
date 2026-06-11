import { GraphQLApi } from '@universe/api'
import { UTCTimestamp } from 'lightweight-charts'
import { useMemo, useReducer } from 'react'
import { PriceChartData } from '~/components/Charts/PriceChart'
import {
  ChartQueryResult,
  ChartType,
  checkDataQuality,
  DataQuality,
  getCurrentUTCTimestamp,
  PriceChartType,
} from '~/components/Charts/utils'

export type TokenPriceChartQueryVariables = {
  chain: GraphQLApi.Chain
  address?: string
  duration: GraphQLApi.HistoryDuration
  multichain: boolean
}

type PriceHistoryEntry = Pick<GraphQLApi.PriceHistoryFallbackFragment, 'timestamp' | 'value'>

function fallbackToPriceChartData(priceHistoryEntry: PriceHistoryEntry): PriceChartData {
  const { value, timestamp } = priceHistoryEntry
  const time = timestamp as UTCTimestamp
  return { time, value, open: value, high: value, low: value, close: value }
}

function toPriceChartData(ohlc: GraphQLApi.CandlestickOhlcFragment): PriceChartData {
  const { open, high, low, close } = ohlc
  const time = ohlc.timestamp as UTCTimestamp
  return { time, value: close.value, open: open.value, high: high.value, low: low.value, close: close.value }
}

const CANDLESTICK_FALLBACK_THRESHOLD = 0.1

export function useTokenPriceChartData({
  variables,
  skip,
  priceChartType,
  currentPriceOverride,
  preferProjectMarketData = false,
}: {
  variables: TokenPriceChartQueryVariables
  skip: boolean
  priceChartType: PriceChartType
  currentPriceOverride?: number
  preferProjectMarketData?: boolean
}): ChartQueryResult<PriceChartData, ChartType.PRICE> & { disableCandlestickUI: boolean } {
  const [fallback, enablePriceHistoryFallback] = useReducer(() => true, false)
  // SPRY: price data is served from the subgraph only (the CoinGecko gateway is not available). RWA
  // (project-market) charts have no OHLC, so they always render as line charts even if stale UI state says candle.
  const effectivePriceChartType = preferProjectMarketData ? PriceChartType.LINE : priceChartType

  // Candlestick charts use subgraph OHLC; line charts use the subgraph price history (with a fallback re-fetch).
  const { data: subgraphData, loading } = GraphQLApi.useTokenPriceQuery({
    variables: { ...variables, fallback },
    skip,
  })

  return useMemo(() => {
    const subgraphMarket = subgraphData?.token?.market
    const { ohlc, priceHistory: subgraphPriceHistory, price: subgraphPrice } = subgraphMarket ?? {}

    const priceHistory: (PriceHistoryEntry | undefined)[] | undefined = subgraphPriceHistory
    const ohlcPriceHistory = ohlc

    // Multi-chain tokens use the per-chain subgraph price (e.g. USDC on Ethereum shows the Ethereum price).
    // When centralized prices are enabled, the override provides live WebSocket prices.
    const currentPrice = currentPriceOverride ?? subgraphPrice?.value

    let entries =
      (ohlcPriceHistory
        ? ohlcPriceHistory.filter((v): v is GraphQLApi.CandlestickOhlcFragment => v !== undefined).map(toPriceChartData)
        : priceHistory?.filter((v): v is PriceHistoryEntry => v !== undefined).map(fallbackToPriceChartData)) ?? []

    if (ohlcPriceHistory) {
      // Special case: backend returns invalid OHLC data on some chains. If we detect long series of 0's, return an empty array to trigger fallback.
      const zeroCount = entries.filter((x) => x.value === 0).length
      if (!ohlcPriceHistory.length || zeroCount / entries.length > CANDLESTICK_FALLBACK_THRESHOLD) {
        enablePriceHistoryFallback() // triggers a re-fetch that uses priceHistory instead of OHLC
        return {
          chartType: ChartType.PRICE,
          entries: [],
          loading: true,
          disableCandlestickUI: true,
          dataQuality: DataQuality.INVALID,
        }
      }

      // For line charts made using ohlc data, the min and max entries should point to their low/high, rather than close,
      // to ensure the chart line makes contact with the min/max lines.
      if (effectivePriceChartType === PriceChartType.LINE) {
        let min = entries[0].low
        let minIndex = 0
        let max = entries[0].high
        let maxIndex = 0

        entries.forEach((entry, index) => {
          if (entry.low < min) {
            min = entry.low
            minIndex = index
          }
          if (entry.high > max) {
            max = entry.high
            maxIndex = index
          }
        })
        // Avoid modifying the last entry, as it should point to the current price
        if (minIndex !== entries.length - 1) {
          entries[minIndex].value = min
        }
        if (maxIndex !== entries.length - 1) {
          entries[maxIndex].value = max
        }
      }
      // Special case: backend data for OHLC data is currently too granular, so points should be combined, halving the data
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      else if (effectivePriceChartType === PriceChartType.CANDLESTICK) {
        const combinedEntries = []

        const startIndex = entries.length % 2 // If the length is odd, start at the second entry
        for (let i = startIndex; i < entries.length; i += 2) {
          const first = entries[i]
          const second = entries[i + 1]
          const combined = {
            time: first.time,
            open: first.open,
            high: Math.max(first.high, second.high),
            low: Math.min(first.low, second.low),
            close: second.close,
            value: second.close,
          }
          combinedEntries.push(combined)
        }
        entries = combinedEntries
      }
    }

    // Append current price to end of array to ensure data freshness and that each time period ends with same price
    if (currentPrice && entries.length > 1) {
      const lastEntry = entries[entries.length - 1]
      const secondToLastEntry = entries[entries.length - 2]
      const granularity = lastEntry.time - secondToLastEntry.time

      const time = getCurrentUTCTimestamp()
      // If the current price falls within the last entry's time window, update the last entry's close price
      if (time - lastEntry.time < granularity) {
        lastEntry.time = time
        lastEntry.value = currentPrice
        lastEntry.close = currentPrice
      } else {
        // If the current price falls outside the last entry's time window, add it as a new entry
        entries.push({
          time,
          value: currentPrice,
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice,
        })
      }
    }

    const dataQuality = checkDataQuality({ data: entries, chartType: ChartType.PRICE, duration: variables.duration })
    return {
      chartType: ChartType.PRICE,
      entries,
      loading,
      dataQuality,
      disableCandlestickUI: preferProjectMarketData || fallback,
    }
  }, [
    currentPriceOverride,
    subgraphData?.token?.market,
    effectivePriceChartType,
    fallback,
    loading,
    preferProjectMarketData,
    variables.duration,
  ])
}
