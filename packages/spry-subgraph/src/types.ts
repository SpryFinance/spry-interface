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
