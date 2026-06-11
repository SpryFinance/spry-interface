import { GraphQLApi } from '@universe/api'
import { ChartType, DataQuality, PriceChartType } from '~/components/Charts/utils'
import { useTokenPriceChartData } from '~/hooks/useTokenPriceChartData'
import { renderHook } from '~/test-utils/render'

const { mockUseTokenPriceQuery } = vi.hoisted(() => {
  const mockUseTokenPriceQuery = vi.fn()
  return { mockUseTokenPriceQuery }
})

vi.mock('@universe/api', async () => {
  const actual = await vi.importActual('@universe/api')
  return {
    ...actual,
    GraphQLApi: {
      ...(actual.GraphQLApi as Record<string, unknown>),
      useTokenPriceQuery: mockUseTokenPriceQuery,
    },
  }
})

function priceHistoryEntry(timestamp: number, value: number) {
  return { timestamp, value }
}

const SUBGRAPH_PRICE_HISTORY = [priceHistoryEntry(1000, 10), priceHistoryEntry(2000, 11), priceHistoryEntry(3000, 12)]

const BASE_VARIABLES = {
  chain: GraphQLApi.Chain.Ethereum,
  address: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
  duration: GraphQLApi.HistoryDuration.Year,
  multichain: false,
}

function makeSubgraphResult(priceHistory: typeof SUBGRAPH_PRICE_HISTORY) {
  return {
    data: { token: { market: { priceHistory, ohlc: null, price: { value: 12 } } } },
    loading: false,
  }
}

// SPRY: the hook is subgraph-only (no CoinGecko gateway). These cover the surviving data paths.
describe('useTokenPriceChartData', () => {
  beforeEach(() => {
    mockUseTokenPriceQuery.mockReturnValue(makeSubgraphResult(SUBGRAPH_PRICE_HISTORY))
  })

  it('uses subgraph price history for line charts', () => {
    const { result } = renderHook(() =>
      useTokenPriceChartData({
        variables: BASE_VARIABLES,
        skip: false,
        priceChartType: PriceChartType.LINE,
      }),
    )

    expect(result.current.chartType).toBe(ChartType.PRICE)
    expect(result.current.dataQuality).toBe(DataQuality.VALID)
    expect(result.current.entries[0].value).toBe(10)
  })

  it('returns INVALID data quality when the subgraph returns an empty array', () => {
    mockUseTokenPriceQuery.mockReturnValue(makeSubgraphResult([]))

    const { result } = renderHook(() =>
      useTokenPriceChartData({
        variables: BASE_VARIABLES,
        skip: false,
        priceChartType: PriceChartType.LINE,
      }),
    )

    expect(result.current.dataQuality).toBe(DataQuality.INVALID)
    expect(result.current.entries).toHaveLength(0)
  })

  it('uses subgraph data for multichain tokens', () => {
    const { result } = renderHook(() =>
      useTokenPriceChartData({
        variables: { ...BASE_VARIABLES, multichain: true },
        skip: false,
        priceChartType: PriceChartType.LINE,
      }),
    )

    expect(result.current.entries[0].value).toBe(10)
  })

  it('forces a line chart and disables the candlestick toggle for project market data (RWA)', () => {
    const { result } = renderHook(() =>
      useTokenPriceChartData({
        variables: BASE_VARIABLES,
        skip: false,
        priceChartType: PriceChartType.CANDLESTICK,
        preferProjectMarketData: true,
      }),
    )

    expect(result.current.disableCandlestickUI).toBe(true)
    expect(result.current.entries[0].value).toBe(10)
  })
})
