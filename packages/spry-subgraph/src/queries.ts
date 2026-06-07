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
      token0 { id symbol decimals }
      token1 { id symbol decimals }
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
