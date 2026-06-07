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
