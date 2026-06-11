// Result row types for the Spry subgraph queries.
//
// GraphQL BigInt / BigDecimal values arrive as strings (brief section 3.4), so
// numeric fields are typed `string` here. Enum fields use the @spry/fee enums,
// whose string values match the subgraph enums. Convert to numbers/percent at
// the display layer (e.g. @spry/fee's feePipsToPercent).

import type { PoolTier, SpryZone, SpryDispatchCase } from '@spry/fee';

export interface TokenRef {
  /** The token (currency) address. */
  id: string;
  symbol: string;
  decimals: string;
  /** Number of Spry pools containing this token. Now maintained; safe as "pools". */
  poolCount: string;
}

/** A row from the Pools list query. */
export interface PoolRow {
  id: string;
  tier: PoolTier;
  baseFeePips: string;
  capFeePips: string;
  /** Current dynamic fee, in pips. */
  feeTier: string;
  avgFeePips: string;
  minFeePips: string | null;
  maxFeePips: string | null;
  volumeUSD: string;
  feesUSD: string;
  totalValueLockedUSD: string;
  /**
   * Count of distinct liquidity-modifying addresses (the immediate caller of
   * ModifyLiquidity, typically the V4 PositionManager or a router), NOT unique
   * end-user LPs. Surface as "LP txn sources", not a unique-user metric.
   */
  liquidityProviderCount: string;
  token0: TokenRef;
  token1: TokenRef;
}

/** A token ref with full ERC-20 metadata (the positions queries). */
export interface TokenMetaRef {
  /** The token (currency) address; the zero address is native ETH. */
  id: string;
  symbol: string;
  name: string;
  decimals: string;
}

/**
 * A row from the positions-by-owner query: one canonical-PositionManager
 * ERC-721. NOT necessarily a Spry position (the PositionManager is shared);
 * resolve the poolKey on-chain and filter against the indexed pools.
 */
export interface PositionRow {
  /** Same as tokenId. */
  id: string;
  tokenId: string;
  /** Current owner, lowercase. */
  owner: string;
  createdAtTimestamp: string;
}

/** A row from the modifies-by-origin query (script-seeded / raw liquidity attribution). */
export interface ModifyRow {
  /** The contract that called PoolManager.modifyLiquidity (router or PositionManager). */
  sender: string;
  /** Signed liquidity delta. */
  amount: string;
  tickLower: string;
  tickUpper: string;
  timestamp: string;
  pool: { id: string };
}

/** A row from the pools-by-ids query: pool identity + state + token metadata. */
export interface PositionPoolRow {
  id: string;
  /** Current dynamic fee in pips (NOT the pool-key fee; Spry keys use DYNAMIC_FEE_FLAG). */
  feeTier: string;
  tickSpacing: string;
  sqrtPrice: string;
  tick: string | null;
  liquidity: string;
  hooks: string;
  tier: PoolTier;
  token0: TokenMetaRef;
  token1: TokenMetaRef;
}

/** A row from the recent-swaps query. */
export interface SwapRow {
  timestamp: string;
  amountUSD: string;
  /** Per-swap LP fee in pips. */
  fee: string;
  feePercent: string;
  feeAmountUSD: string;
  zone: SpryZone | null;
  dispatchCase: SpryDispatchCase | null;
  viaSpryRouter: boolean;
  /** Block-windowed cumulative before/after this swap (the SpryFee endpoints). */
  cumBefore: string | null;
  cumAfter: string | null;
}

/** A row from the tiers overview query (`Tier` entity; id = tier name). */
export interface TierRow {
  id: string;
  poolCount: string;
  volumeUSD: string;
  feesUSD: string;
  baseFeePips: string;
  capFeePips: string;
  avgFeePips: string;
  safeCount: string;
  alertCount: string;
  dangerCount: string;
  capCount: string;
}

/** A row from the per-pool block-window query (`SpryFeeWindow`). */
export interface SpryFeeWindowRow {
  windowId: string;
  cumOpen: string;
  cumLast: string;
  cumMin: string;
  cumMax: string;
  swapCount: string;
}
