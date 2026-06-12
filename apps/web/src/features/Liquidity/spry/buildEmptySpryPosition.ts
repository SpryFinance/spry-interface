// SPRY: when the create-position form resolves an EXISTING pool, the page
// routes into the shared Add-liquidity modal instead of the create review. If
// the wallet already holds a position there, the modal gets that real
// PositionInfo; otherwise it gets this zero-liquidity raw-position stand-in,
// whose synthetic tokenId points the local increase rails at the
// PoolModifyLiquidityTest router (the first add simply mints the wallet's raw
// slot at the pool's full range).

import { getSpryConfig } from '@spry/config'
import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { CurrencyAmount } from '@uniswap/sdk-core'
import { Pool as V4Pool, Position as V4Position } from '@uniswap/v4-sdk'
import { DYNAMIC_FEE_AMOUNT } from 'uniswap/src/constants/pools'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import type { V4PositionInfo } from 'uniswap/src/features/positions/types'

const MAX_TICK = 887272

/**
 * A zero-liquidity full-range raw position for an existing Spry pool, shaped
 * like the entries from useSpryWalletPositions (minus the spry zone meta,
 * which needs subgraph counts this caller does not have).
 */
export function buildEmptySpryPosition({
  pool,
  poolId,
  owner,
}: {
  pool: V4Pool
  poolId: string
  owner: string
}): V4PositionInfo | undefined {
  const chainId = pool.currency0.chainId
  const router = getSpryConfig(chainId)?.addresses.poolModifyLiquidityTest
  if (!router) {
    return undefined
  }

  const tickSpacing = pool.tickSpacing
  const tickLower = Math.ceil(-MAX_TICK / tickSpacing) * tickSpacing
  const tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing
  const position = new V4Position({ pool, liquidity: 0, tickLower, tickUpper })

  // oxlint-disable-next-line universe-custom/no-tolowercase-address-currencyid -- bytes32 poolId (not an address), normalized to match subgraph Pool.id casing
  const poolIdNormalized = poolId.toLowerCase()

  return {
    version: ProtocolVersion.V4,
    status: PositionStatus.IN_RANGE,
    chainId,
    poolId: poolIdNormalized,
    // same shape the positions list synthesizes: spry-raw-<poolId>|<tl>|<tu>|<router>
    tokenId: `spry-raw-${poolIdNormalized}|${tickLower}|${tickUpper}|${normalizeTokenAddressForCache(router)}`,
    tickLower,
    tickUpper,
    tickSpacing,
    liquidity: '0',
    poolOrPair: pool,
    position,
    feeTier: {
      feeAmount: DYNAMIC_FEE_AMOUNT,
      tickSpacing,
      isDynamic: true,
    },
    v4hook: pool.hooks,
    owner,
    currency0Amount: position.amount0,
    currency1Amount: position.amount1,
    token0UncollectedFees: '0',
    token1UncollectedFees: '0',
    fee0Amount: CurrencyAmount.fromRawAmount(pool.currency0, 0),
    fee1Amount: CurrencyAmount.fromRawAmount(pool.currency1, 0),
    isHidden: false,
  }
}
