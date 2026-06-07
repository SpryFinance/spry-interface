import { Token } from '@uniswap/sdk-core'
import { GraphQLApi } from '@universe/api'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { CurrencyInfo, TokenList } from 'uniswap/src/features/dataApi/types'
import { renderHook, waitFor } from 'uniswap/src/test/test-utils'
import { buildCurrencyId } from 'uniswap/src/utils/currencyId'

// Mock the two hooks the fallback composes. COMMON_BASES, currencyInfosToTokenOptions
// and useCurrencyInfosToTokenOptions are left REAL (they are pure local transforms),
// so the test exercises the actual fallback path against the real COMMON_BASES entry.
const { mockUseCommonTokensOptions, mockUseCurrencies } = vi.hoisted(() => ({
  mockUseCommonTokensOptions: vi.fn(),
  mockUseCurrencies: vi.fn(),
}))

vi.mock('uniswap/src/components/TokenSelector/hooks/useCommonTokensOptions', () => ({
  useCommonTokensOptions: mockUseCommonTokensOptions,
}))

vi.mock('uniswap/src/components/TokenSelector/hooks/useCurrencies', () => ({
  useCurrencies: mockUseCurrencies,
}))

// Imported after the vi.mock calls for readability; vitest hoists vi.mock regardless.
import { useCommonTokensOptionsWithFallback } from 'uniswap/src/components/TokenSelector/hooks/useCommonTokensOptionsWithFallback'

// sptA address (the Spry pool's token0), used to build the gateway-result fixture below.
const SPT_A_ADDRESS = '0xb56d680aea10bb81414851c44f46c8e315932342'

const portfolioData = { data: {}, error: undefined, loading: false, refetch: vi.fn() }

function makeCurrencyInfo(token: Token): CurrencyInfo {
  return {
    currencyId: buildCurrencyId(token.chainId, token.address),
    currency: token,
    logoUrl: null,
    safetyInfo: {
      tokenList: TokenList.Default,
      protectionResult: GraphQLApi.ProtectionResult.Benign,
    },
  }
}

describe(useCommonTokensOptionsWithFallback, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to local COMMON_BASES tokens when the gateway re-fetch is empty (Base Sepolia)', async () => {
    // Primary common-tokens result is empty (gateway does not serve Base Sepolia)...
    mockUseCommonTokensOptions.mockReturnValue({ data: [], error: undefined, loading: false, refetch: vi.fn() })
    // ...and the gateway re-resolution (useCurrencies -> useTokenProjects) also returns nothing.
    mockUseCurrencies.mockReturnValue({ data: [], error: undefined, loading: false, refetch: vi.fn() })

    const { result } = renderHook(() =>
      useCommonTokensOptionsWithFallback({ chainFilter: UniverseChainId.BaseSepolia, portfolioData }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    const symbols = (result.current.data ?? []).map((opt) => opt.currencyInfo.currency.symbol)
    // sptA + sptB (from COMMON_BASES[BaseSepolia]) render even though the gateway was empty.
    expect(symbols).toContain('sptA')
    expect(symbols).toContain('sptB')
  })

  it('uses the gateway-resolved options when present (normal path is unchanged)', async () => {
    mockUseCommonTokensOptions.mockReturnValue({ data: [], error: undefined, loading: false, refetch: vi.fn() })
    const gatewayCurrencyInfo = makeCurrencyInfo(
      new Token(UniverseChainId.BaseSepolia, SPT_A_ADDRESS, 18, 'sptA', 'Spry Test Token A'),
    )
    mockUseCurrencies.mockReturnValue({
      data: [gatewayCurrencyInfo],
      error: undefined,
      loading: false,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() =>
      useCommonTokensOptionsWithFallback({ chainFilter: UniverseChainId.BaseSepolia, portfolioData }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    // When the gateway returns options, those are used (the fix does not break the normal path).
    expect(result.current.data?.length).toBeGreaterThan(0)
  })
})
