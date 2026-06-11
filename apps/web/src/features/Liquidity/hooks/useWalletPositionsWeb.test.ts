import { renderHook } from '@testing-library/react'
import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { useWalletPositionsWeb } from '~/features/Liquidity/hooks/useWalletPositionsWeb'

// SPRY: useWalletPositionsWeb is fed by useSpryWalletPositions (subgraph +
// chain reads) instead of the gateway useWalletPositions; these tests cover the
// web-layer responsibilities that remain here: forwarding, local
// status/version/chain filtering, dedupe, visibility partition, and flags.

const { mockUseSpryWalletPositions, mockUsePositionVisibilityCheck, mockUsePendingLPTransactionsChangeListener } =
  vi.hoisted(() => ({
    mockUseSpryWalletPositions: vi.fn(),
    mockUsePositionVisibilityCheck: vi.fn(),
    mockUsePendingLPTransactionsChangeListener: vi.fn(),
  }))

vi.mock('~/features/Liquidity/spry/useSpryWalletPositions', () => ({
  useSpryWalletPositions: mockUseSpryWalletPositions,
}))

vi.mock('uniswap/src/features/visibility/hooks/usePositionVisibilityCheck', () => ({
  usePositionVisibilityCheck: mockUsePositionVisibilityCheck,
}))

vi.mock('~/state/transactions/hooks', () => ({
  usePendingLPTransactionsChangeListener: mockUsePendingLPTransactionsChangeListener,
}))

// ---------- Test fixtures ----------

const ADDRESS = '0xUser'
const DEFAULT_VERSIONS = [ProtocolVersion.V4]
const DEFAULT_STATUSES = [PositionStatus.IN_RANGE, PositionStatus.CLOSED]

const positionInfo = (id: string, overrides: Partial<PositionInfo> = {}): PositionInfo =>
  ({
    poolId: `pool-${id}`,
    tokenId: id,
    chainId: UniverseChainId.BaseSepolia,
    version: ProtocolVersion.V4,
    status: PositionStatus.IN_RANGE,
    isHidden: false,
    ...overrides,
  }) as PositionInfo

const spryResultFor = (
  positions: PositionInfo[] = [],
  overrides: Partial<ReturnType<typeof mockUseSpryWalletPositions>> = {},
): ReturnType<typeof mockUseSpryWalletPositions> => ({
  positions,
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
})

const baseParams = {
  address: ADDRESS,
  chainFilter: null,
  versionFilter: DEFAULT_VERSIONS,
  statusFilter: DEFAULT_STATUSES,
}

describe('useWalletPositionsWeb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSpryWalletPositions.mockReturnValue(spryResultFor([]))
    mockUsePositionVisibilityCheck.mockReturnValue(() => true)
  })

  describe('query input forwarding', () => {
    it('forwards address and chainFilter to useSpryWalletPositions', () => {
      renderHook(() => useWalletPositionsWeb({ ...baseParams, chainFilter: UniverseChainId.BaseSepolia }))

      expect(mockUseSpryWalletPositions).toHaveBeenCalledWith({
        address: ADDRESS,
        chainFilter: UniverseChainId.BaseSepolia,
      })
    })

    it('forwards undefined address (disconnected) unchanged', () => {
      renderHook(() => useWalletPositionsWeb({ ...baseParams, address: undefined }))

      expect(mockUseSpryWalletPositions).toHaveBeenCalledWith({ address: undefined, chainFilter: null })
    })
  })

  describe('local filtering', () => {
    it('drops positions whose status is not in statusFilter', () => {
      mockUseSpryWalletPositions.mockReturnValue(
        spryResultFor([
          positionInfo('open', { status: PositionStatus.IN_RANGE }),
          positionInfo('closed', { status: PositionStatus.CLOSED }),
        ]),
      )

      const { result } = renderHook(() =>
        useWalletPositionsWeb({ ...baseParams, statusFilter: [PositionStatus.IN_RANGE] }),
      )

      expect(result.current.visiblePositions.map((p) => p.tokenId)).toEqual(['open'])
    })

    it('drops positions whose version is not in versionFilter', () => {
      mockUseSpryWalletPositions.mockReturnValue(
        spryResultFor([positionInfo('v4', { version: ProtocolVersion.V4 })]),
      )

      const { result } = renderHook(() => useWalletPositionsWeb({ ...baseParams, versionFilter: [] }))

      expect(result.current.visiblePositions).toHaveLength(0)
    })

    it('drops positions whose chainId mismatches chainFilter', () => {
      mockUseSpryWalletPositions.mockReturnValue(
        spryResultFor([
          positionInfo('base-sepolia', { chainId: UniverseChainId.BaseSepolia }),
          positionInfo('mainnet', { chainId: UniverseChainId.Mainnet }),
        ]),
      )

      const { result } = renderHook(() =>
        useWalletPositionsWeb({ ...baseParams, chainFilter: UniverseChainId.BaseSepolia }),
      )

      expect(result.current.visiblePositions.map((p) => p.tokenId)).toEqual(['base-sepolia'])
    })

    it('dedupes by composite key (first occurrence wins)', () => {
      mockUseSpryWalletPositions.mockReturnValue(
        spryResultFor([positionInfo('dup'), positionInfo('dup', { isHidden: true })]),
      )

      const { result } = renderHook(() => useWalletPositionsWeb(baseParams))

      expect(result.current.visiblePositions).toHaveLength(1)
      expect(result.current.visiblePositions[0]?.isHidden).toBe(false)
    })
  })

  describe('partition + visibility', () => {
    it('partitions visible vs hidden via the visibility check', () => {
      mockUseSpryWalletPositions.mockReturnValue(
        spryResultFor([positionInfo('a'), positionInfo('b'), positionInfo('c')]),
      )
      mockUsePositionVisibilityCheck.mockReturnValue(({ tokenId }: { tokenId?: string }) => tokenId !== 'b')

      const { result } = renderHook(() => useWalletPositionsWeb(baseParams))

      expect(result.current.visiblePositions.map((p) => p.tokenId)).toEqual(['a', 'c'])
      expect(result.current.hiddenPositions.map((p) => p.tokenId)).toEqual(['b'])
    })

    it('passes poolId/tokenId/chainId/isFlaggedSpam to the visibility check', () => {
      const visibilityCheck = vi.fn().mockReturnValue(true)
      mockUsePositionVisibilityCheck.mockReturnValue(visibilityCheck)
      mockUseSpryWalletPositions.mockReturnValue(spryResultFor([positionInfo('a', { isHidden: true, poolId: 'pool-X' })]))

      renderHook(() => useWalletPositionsWeb(baseParams))

      expect(visibilityCheck).toHaveBeenCalledWith({
        poolId: 'pool-X',
        tokenId: 'a',
        chainId: UniverseChainId.BaseSepolia,
        isFlaggedSpam: true,
      })
    })
  })

  describe('derived flags', () => {
    it('isLoadingPositions is true while loading with an address', () => {
      mockUseSpryWalletPositions.mockReturnValue(spryResultFor([], { isLoading: true }))

      const { result } = renderHook(() => useWalletPositionsWeb(baseParams))

      expect(result.current.isLoadingPositions).toBe(true)
    })

    it('isLoadingPositions is false when address is undefined (disconnected)', () => {
      mockUseSpryWalletPositions.mockReturnValue(spryResultFor([], { isLoading: true }))

      const { result } = renderHook(() => useWalletPositionsWeb({ ...baseParams, address: undefined }))

      expect(result.current.isLoadingPositions).toBe(false)
    })

    it('hasErrorWithoutData is true when error and no positions', () => {
      mockUseSpryWalletPositions.mockReturnValue(spryResultFor([], { error: new Error('boom') }))

      const { result } = renderHook(() => useWalletPositionsWeb(baseParams))

      expect(result.current.hasErrorWithoutData).toBe(true)
    })

    it('hasErrorWithoutData is false when error but positions exist', () => {
      mockUseSpryWalletPositions.mockReturnValue(spryResultFor([positionInfo('a')], { error: new Error('boom') }))

      const { result } = renderHook(() => useWalletPositionsWeb(baseParams))

      expect(result.current.hasErrorWithoutData).toBe(false)
    })

    it('pagination is permanently exhausted (single-shot fetch)', () => {
      const { result } = renderHook(() => useWalletPositionsWeb(baseParams))

      expect(result.current.hasNextPage).toBe(false)
      expect(result.current.isPlaceholderData).toBe(false)
      expect(() => result.current.loadMorePositions()).not.toThrow()
    })
  })

  describe('pending-tx refetch listener', () => {
    it('subscribes usePendingLPTransactionsChangeListener with the refetch from useSpryWalletPositions', () => {
      const refetch = vi.fn()
      mockUseSpryWalletPositions.mockReturnValue(spryResultFor([], { refetch }))

      renderHook(() => useWalletPositionsWeb(baseParams))

      expect(mockUsePendingLPTransactionsChangeListener).toHaveBeenCalledWith(refetch)
    })
  })
})
