// Spry subgraph query documents (brief section 13). Field names are validated
// against the deployed schema (introspection) and the live test.

/** Pool list with tier + live dynamic fee, ordered by volume. */
export const POOLS_QUERY = `
  query Pools($first: Int = 50) {
    pools(first: $first, orderBy: volumeUSD, orderDirection: desc) {
      id
      tier
      baseFeePips
      capFeePips
      feeTier
      avgFeePips
      minFeePips
      maxFeePips
      volumeUSD
      feesUSD
      totalValueLockedUSD
      liquidityProviderCount
      token0 { id symbol decimals poolCount }
      token1 { id symbol decimals poolCount }
    }
  }
`;

/** Recent swaps for a pool with their dynamic fee + zone. */
export const POOL_SWAPS_QUERY = `
  query PoolSwaps($pool: String!, $first: Int = 50) {
    swaps(first: $first, orderBy: timestamp, orderDirection: desc, where: { pool: $pool }) {
      timestamp
      amountUSD
      fee
      feePercent
      feeAmountUSD
      zone
      dispatchCase
      viaSpryRouter
      cumBefore
      cumAfter
    }
  }
`;

/** Fee-curve trajectory per block-window for a pool. */
export const POOL_WINDOWS_QUERY = `
  query PoolWindows($pool: String!, $first: Int = 100) {
    spryFeeWindows(first: $first, orderBy: windowId, orderDirection: desc, where: { pool: $pool }) {
      windowId
      cumOpen
      cumLast
      cumMin
      cumMax
      swapCount
    }
  }
`;

/**
 * PositionManager (ERC-721) positions owned by a wallet, newest first. NOTE:
 * the Position entity tracks the CANONICAL PositionManager, which is shared by
 * every Base Sepolia protocol; a returned tokenId is not necessarily a Spry
 * position. Resolve each tokenId's poolKey on-chain and keep only those whose
 * poolId exists in this subgraph (every indexed pool is a Spry pool).
 * Owners are stored lowercase; pass the address lowercased.
 */
export const POSITIONS_BY_OWNER_QUERY = `
  query PositionsByOwner($owner: String!, $first: Int = 500) {
    positions(first: $first, where: { owner: $owner }, orderBy: createdAtTimestamp, orderDirection: desc) {
      id
      tokenId
      owner
      createdAtTimestamp
    }
  }
`;

/**
 * Every ModifyLiquidity whose tx was initiated by a wallet (the EOA origin).
 * This is how script-seeded liquidity (PoolModifyLiquidityTest router with
 * salt = owner address, no NFT) is attributed to its owner: group rows by
 * (pool, tickLower, tickUpper, sender) and read the live liquidity on-chain at
 * positionId = keccak(sender, ticks, salt = owner). Rows whose sender is the
 * canonical PositionManager belong to NFT positions and must be skipped here.
 */
export const MODIFIES_BY_ORIGIN_QUERY = `
  query ModifiesByOrigin($origin: Bytes!, $first: Int = 1000) {
    modifyLiquidities(first: $first, where: { origin: $origin }, orderBy: timestamp, orderDirection: desc) {
      sender
      amount
      tickLower
      tickUpper
      timestamp
      pool { id }
    }
  }
`;

/**
 * Pool identity + live-ish state for a set of poolIds, with full token
 * metadata. Doubles as the Spry filter: only Spry pools are indexed, so a
 * missing id means "not a Spry pool".
 */
export const POOLS_BY_IDS_QUERY = `
  query PoolsByIds($ids: [ID!]!) {
    pools(where: { id_in: $ids }) {
      id
      feeTier
      tickSpacing
      sqrtPrice
      tick
      liquidity
      hooks
      tier
      token0 { id symbol name decimals }
      token1 { id symbol name decimals }
    }
  }
`;

/** Tiers overview, ordered by volume. */
export const TIERS_QUERY = `
  query Tiers {
    tiers(orderBy: volumeUSD, orderDirection: desc) {
      id
      poolCount
      volumeUSD
      feesUSD
      baseFeePips
      capFeePips
      avgFeePips
      safeCount
      alertCount
      dangerCount
      capCount
    }
  }
`;
