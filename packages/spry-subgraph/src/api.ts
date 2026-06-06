// Typed query functions over a SpryGraphClient.

import type { SpryGraphClient } from './client';
import { POOLS_QUERY, POOL_SWAPS_QUERY, POOL_WINDOWS_QUERY, TIERS_QUERY } from './queries';
import type { PoolRow, SwapRow, TierRow, SpryFeeWindowRow } from './types';

/** Spry pools, ordered by volume (every indexed pool is already a Spry pool). */
export async function fetchPools(client: SpryGraphClient, vars: { first?: number } = {}): Promise<PoolRow[]> {
  const data = await client.request<{ pools: PoolRow[] }>(POOLS_QUERY, vars);
  return data.pools;
}

/** Recent swaps for a pool (id), newest first. */
export async function fetchPoolSwaps(
  client: SpryGraphClient,
  pool: string,
  vars: { first?: number } = {},
): Promise<SwapRow[]> {
  const data = await client.request<{ swaps: SwapRow[] }>(POOL_SWAPS_QUERY, { pool, ...vars });
  return data.swaps;
}

/** Block-window fee-curve trajectory for a pool (id), newest window first. */
export async function fetchPoolWindows(
  client: SpryGraphClient,
  pool: string,
  vars: { first?: number } = {},
): Promise<SpryFeeWindowRow[]> {
  const data = await client.request<{ spryFeeWindows: SpryFeeWindowRow[] }>(POOL_WINDOWS_QUERY, { pool, ...vars });
  return data.spryFeeWindows;
}

/** Per-tier aggregates, ordered by volume. */
export async function fetchTiers(client: SpryGraphClient): Promise<TierRow[]> {
  const data = await client.request<{ tiers: TierRow[] }>(TIERS_QUERY);
  return data.tiers;
}
