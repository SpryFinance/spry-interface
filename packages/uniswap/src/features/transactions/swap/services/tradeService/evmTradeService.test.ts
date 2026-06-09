import { CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core'
import { FetchError, TradingApi } from '@universe/api'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { createEVMTradeService } from 'uniswap/src/features/transactions/swap/services/tradeService/evmTradeService'
import { buildSpryLocalQuote } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import type { TradeRepository } from 'uniswap/src/features/transactions/swap/services/tradeService/tradeRepository'
import type { UseTradeArgs } from 'uniswap/src/features/transactions/swap/types/trade'

vi.mock('uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote', () => ({
  buildSpryLocalQuote: vi.fn(),
  buildSpryWrapQuote: vi.fn(),
  buildSprySwapQuote: vi.fn(),
  spryPublicClient: {},
}))

const mockBuildSpryLocalQuote = buildSpryLocalQuote as ReturnType<typeof vi.fn>

const sptA = new Token(UniverseChainId.BaseSepolia, '0xb56d680aea10bb81414851c44f46c8e315932342', 18, 'sptA')
const sptB = new Token(UniverseChainId.BaseSepolia, '0xbebc724ee71f74cadfd927ed235e4dc71ff28c8b', 18, 'sptB')

function makeService() {
  return createEVMTradeService({
    tradeRepository: { fetchQuote: vi.fn(), fetchIndicativeQuote: vi.fn() } as unknown as TradeRepository,
    getEnabledChains: () => [UniverseChainId.BaseSepolia],
    getIsL2ChainId: () => true,
    getMinAutoSlippageToleranceL2: () => 2.5,
  })
}

function makeInput(overrides?: Partial<UseTradeArgs>): UseTradeArgs {
  return {
    amountSpecified: CurrencyAmount.fromRawAmount(sptA, '1000000000000000000'),
    otherCurrency: sptB,
    tradeType: TradeType.EXACT_INPUT,
    ...overrides,
  } as UseTradeArgs
}

describe('createEVMTradeService getTrade on Base Sepolia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws the gateway-equivalent 404 when no Spry route can fill', async () => {
    mockBuildSpryLocalQuote.mockResolvedValue(null)

    const error: unknown = await makeService()
      .getTrade(makeInput())
      .catch((e: unknown) => e)

    expect(buildSpryLocalQuote).toHaveBeenCalled()
    expect(error).toBeInstanceOf(FetchError)
    const fetchError = error as FetchError
    expect(fetchError.response.status).toBe(404)
    expect(fetchError.data?.errorCode).toBe(TradingApi.Err404.errorCode.RESOURCE_NOT_FOUND)
  })

  it('stays silent (no trade, no error) for USD valuation quotes', async () => {
    mockBuildSpryLocalQuote.mockResolvedValue(null)

    const result = await makeService().getTrade(makeInput({ isUSDQuote: true }))

    expect(result.trade).toBeNull()
  })
})
