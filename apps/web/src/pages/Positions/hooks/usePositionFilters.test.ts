import { act, renderHook } from '@testing-library/react'
import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { Provider } from 'jotai'
import { createElement, type ReactNode } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { DEFAULT_LP_POSITION_PROTOCOL_FILTER, DEFAULT_LP_POSITION_STATUS_FILTER } from '~/features/Liquidity/constants'
import { usePositionFilters } from '~/pages/Positions/hooks/usePositionFilters'

// Each renderHook gets its own isolated atom store via a fresh <Provider>
// so previous tests can't leak default-store state into later ones.
function renderUsePositionFilters() {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, null, children)
  return renderHook(() => usePositionFilters(), { wrapper })
}

describe('usePositionFilters', () => {
  it('exposes default filter values', () => {
    const { result } = renderUsePositionFilters()

    expect(result.current.chainFilter).toBeNull()
    expect(result.current.versionFilter).toEqual(DEFAULT_LP_POSITION_PROTOCOL_FILTER)
    expect(result.current.statusFilter).toEqual(DEFAULT_LP_POSITION_STATUS_FILTER)
  })

  it('updates chainFilter via setChainFilter', () => {
    const { result } = renderUsePositionFilters()

    act(() => result.current.setChainFilter(UniverseChainId.Mainnet))

    expect(result.current.chainFilter).toBe(UniverseChainId.Mainnet)
  })

  it('clears chainFilter when setChainFilter receives null', () => {
    const { result } = renderUsePositionFilters()

    act(() => result.current.setChainFilter(UniverseChainId.Mainnet))
    act(() => result.current.setChainFilter(null))

    expect(result.current.chainFilter).toBeNull()
  })

  it('toggleVersion removes a version that was present', () => {
    const { result } = renderUsePositionFilters()

    // SPRY: the default filter is v4-only, so toggling V4 off empties it.
    act(() => result.current.toggleVersion(ProtocolVersion.V4))

    expect(result.current.versionFilter).toEqual([])
  })

  it('toggleVersion re-adds a version after removing it', () => {
    const { result } = renderUsePositionFilters()

    act(() => result.current.toggleVersion(ProtocolVersion.V4))
    act(() => result.current.toggleVersion(ProtocolVersion.V4))

    expect(result.current.versionFilter).toEqual([ProtocolVersion.V4])
  })

  it('toggleStatus adds a status that was absent', () => {
    const { result } = renderUsePositionFilters()

    act(() => result.current.toggleStatus(PositionStatus.CLOSED))

    // SPRY: the default status filter is [IN_RANGE] (= "In Pool"); v4 has no out-of-range.
    expect(result.current.statusFilter).toEqual([PositionStatus.IN_RANGE, PositionStatus.CLOSED])
  })

  it('toggleStatus removes a status that was present', () => {
    const { result } = renderUsePositionFilters()

    act(() => result.current.toggleStatus(PositionStatus.IN_RANGE))

    expect(result.current.statusFilter).toEqual([])
  })

  it('toggleVersion does not mutate statusFilter, and toggleStatus does not mutate versionFilter', () => {
    const { result } = renderUsePositionFilters()

    act(() => result.current.toggleVersion(ProtocolVersion.V4))
    act(() => result.current.toggleStatus(PositionStatus.CLOSED))

    expect(result.current.versionFilter).toEqual([])
    expect(result.current.statusFilter).toEqual([PositionStatus.IN_RANGE, PositionStatus.CLOSED])
  })

  it('toggleVersion uses a functional setter — captured handler from earlier render still applies relative to latest atom value', () => {
    const { result } = renderUsePositionFilters()

    // Capture toggleVersion from the first render BEFORE any mutation.
    const capturedToggle = result.current.toggleVersion

    // Mutate state via a different handler so the atom value diverges from
    // what the captured handler "saw" at capture time.
    act(() => result.current.toggleVersion(ProtocolVersion.V4))
    // versionFilter is now []

    // Invoke the captured handler — if the toggle closed over a stale snapshot,
    // it would re-derive against the original [V4] and remove V4, yielding [].
    // With a functional setter, it applies relative to the latest [] and re-adds V4.
    act(() => capturedToggle(ProtocolVersion.V4))

    expect(result.current.versionFilter).toEqual([ProtocolVersion.V4])
  })
})
