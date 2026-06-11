import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { PositionInfo } from 'uniswap/src/features/positions/types'
import { LiquidityPositionInfo } from '~/features/Liquidity/LiquidityPositionInfo'
import { TEST_TOKEN_1, TEST_TOKEN_2, toCurrencyAmount } from '~/test-utils/constants'
import { render } from '~/test-utils/render'

vi.mock('~/features/Liquidity/utils')

describe('LiquidityPositionInfo', () => {
  it('should render in range', () => {
    const positionInfo: PositionInfo = {
      chainId: TEST_TOKEN_1.chainId,
      currency0Amount: toCurrencyAmount(TEST_TOKEN_1, 1),
      currency1Amount: toCurrencyAmount(TEST_TOKEN_2, 1),
      status: PositionStatus.IN_RANGE,
      version: ProtocolVersion.V3,
      poolId: '1',
      tokenId: '1',
      v4hook: undefined,
      owner: '0x50EC05ADe8280758E2077fcBC08D878D4aef79C3',
    }
    // SPRY: the status label ("In Pool") renders next to the pair name; the legacy status indicator
    // ("In range") still renders as the fallback when the position has no Spry tier meta.
    const { getByText } = render(<LiquidityPositionInfo positionInfo={positionInfo} />)
    expect(getByText('In Pool')).toBeInTheDocument()
    expect(getByText('In range')).toBeInTheDocument()
  })

  it('should render out of range', () => {
    const positionInfo: PositionInfo = {
      chainId: TEST_TOKEN_1.chainId,
      currency0Amount: toCurrencyAmount(TEST_TOKEN_1, 1),
      currency1Amount: toCurrencyAmount(TEST_TOKEN_2, 1),
      status: PositionStatus.OUT_OF_RANGE,
      version: ProtocolVersion.V3,
      poolId: '1',
      tokenId: '4',
      v4hook: undefined,
      owner: '0x50EC05ADe8280758E2077fcBC08D878D4aef79C3',
    }
    // SPRY: the label now renders twice without tier meta - next to the pair name and in the
    // fallback status indicator.
    const { getAllByText } = render(<LiquidityPositionInfo positionInfo={positionInfo} />)
    expect(getAllByText('Out of range').length).toBeGreaterThan(0)
  })

  it('should render closed', () => {
    const positionInfo: PositionInfo = {
      chainId: TEST_TOKEN_1.chainId,
      currency0Amount: toCurrencyAmount(TEST_TOKEN_1, 1),
      currency1Amount: toCurrencyAmount(TEST_TOKEN_2, 1),
      poolId: '1',
      status: PositionStatus.CLOSED,
      version: ProtocolVersion.V3,
      tokenId: '1',
      v4hook: undefined,
      owner: '0x50EC05ADe8280758E2077fcBC08D878D4aef79C3',
    }
    // SPRY: same duplication as above - pair-adjacent label + fallback indicator.
    const { getAllByText } = render(<LiquidityPositionInfo positionInfo={positionInfo} />)
    expect(getAllByText('Closed').length).toBeGreaterThan(0)
  })
})
