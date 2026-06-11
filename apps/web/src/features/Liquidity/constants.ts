import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { FeeAmount, TICK_SPACINGS } from '@uniswap/v3-sdk'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

interface FeeDataWithChain {
  feeData: {
    isDynamic: boolean
    feeAmount: FeeAmount
    tickSpacing: number
  }
  supportedChainIds?: UniverseChainId[]
}

export const defaultFeeTiers: Record<FeeAmount, FeeDataWithChain> = {
  [FeeAmount.LOWEST]: {
    feeData: { feeAmount: FeeAmount.LOWEST, tickSpacing: TICK_SPACINGS[FeeAmount.LOWEST], isDynamic: false },
  },
  [FeeAmount.LOW_200]: {
    feeData: { feeAmount: FeeAmount.LOW_200, tickSpacing: TICK_SPACINGS[FeeAmount.LOW_200], isDynamic: false },
    supportedChainIds: [UniverseChainId.Base],
  },
  [FeeAmount.LOW_300]: {
    feeData: { feeAmount: FeeAmount.LOW_300, tickSpacing: TICK_SPACINGS[FeeAmount.LOW_300], isDynamic: false },
    supportedChainIds: [UniverseChainId.Base],
  },
  [FeeAmount.LOW_400]: {
    feeData: { feeAmount: FeeAmount.LOW_400, tickSpacing: TICK_SPACINGS[FeeAmount.LOW_400], isDynamic: false },
    supportedChainIds: [UniverseChainId.Base],
  },
  [FeeAmount.LOW]: {
    feeData: { feeAmount: FeeAmount.LOW, tickSpacing: TICK_SPACINGS[FeeAmount.LOW], isDynamic: false },
  },
  [FeeAmount.MEDIUM]: {
    feeData: { feeAmount: FeeAmount.MEDIUM, tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM], isDynamic: false },
  },
  [FeeAmount.HIGH]: {
    feeData: { feeAmount: FeeAmount.HIGH, tickSpacing: TICK_SPACINGS[FeeAmount.HIGH], isDynamic: false },
  },
} as const

// SPRY: v4-only (SpryHook is a v4 hook); v2/v3 LP positions are not supported.
export const LP_POSITION_PROTOCOL_VERSIONS = [ProtocolVersion.V4]
// SPRY: positions have no concentrated range (full-range by design), so there is no
// in-range/out-of-range distinction - just "In Pool" (open, = IN_RANGE) vs "Closed".
export const LP_POSITION_STATUS_FILTER_OPTIONS = [PositionStatus.IN_RANGE, PositionStatus.CLOSED]

export const DEFAULT_LP_POSITION_PROTOCOL_FILTER = [...LP_POSITION_PROTOCOL_VERSIONS]
export const DEFAULT_LP_POSITION_STATUS_FILTER = [PositionStatus.IN_RANGE]
