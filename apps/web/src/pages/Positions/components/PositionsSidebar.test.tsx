import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { PositionsSidebar } from '~/pages/Positions/components/PositionsSidebar'
import { render, screen } from '~/test-utils/render'

vi.mock('~/pages/Positions/TopPools', () => ({
  TopPools: ({ chainId }: { chainId: UniverseChainId | null }) => (
    <div data-testid="top-pools-mock">{chainId === null ? 'all-chains' : `chain-${chainId}`}</div>
  ),
}))

describe('PositionsSidebar', () => {
  // SPRY: "Top pools by TVL" is commented out for the testnet phase (gateway-only data). Restore the
  // two assertions below (and the render in PositionsSidebar.tsx) when TopPools comes back for mainnet.
  it('does not render TopPools (hidden for the testnet phase)', () => {
    render(<PositionsSidebar chainFilter={UniverseChainId.Mainnet} isConnected={false} />)

    expect(screen.queryByTestId('top-pools-mock')).not.toBeInTheDocument()
  })

  it('hides the learn-more block when isConnected is false', () => {
    render(<PositionsSidebar chainFilter={null} isConnected={false} />)

    expect(screen.queryByText('Learn about liquidity provision')).not.toBeInTheDocument()
  })

  it('shows the learn-more block when isConnected is true', () => {
    render(<PositionsSidebar chainFilter={null} isConnected={true} />)

    expect(screen.getByText('Learn about liquidity provision')).toBeInTheDocument()
  })
})
