// Typed query functions over a SpryGraphClient.

import type { SpryGraphClient } from './client';
import {
  MODIFIES_BY_ORIGIN_QUERY,
  POOLS_BY_IDS_QUERY,
  POOLS_QUERY,
  POOL_SWAPS_QUERY,
  POOL_WINDOWS_QUERY,
  POSITIONS_BY_OWNER_QUERY,
  TIERS_QUERY,
} from './queries';
import type { ModifyRow, PoolRow, PositionPoolRow, PositionRow, SwapRow, TierRow, SpryFeeWindowRow } from './types';

/** Spry pools, ordered by volume (every indexed pool is already a Spry pool). */
export async function fetchPools(client: SpryGraphClient, vars: { first?: number } = {}): Promise<PoolRow[]> {
  const data = await client.request<{ pools?: PoolRow[] }>(POOLS_QUERY, vars);
  return data.pools ?? [];
}

/** Recent swaps for a pool (id), newest first. */
export async function fetchPoolSwaps(
  client: SpryGraphClient,
  args: { pool: string; first?: number },
): Promise<SwapRow[]> {
  const data = await client.request<{ swaps?: SwapRow[] }>(POOL_SWAPS_QUERY, args);
  return data.swaps ?? [];
}

/** Block-window fee-curve trajectory for a pool (id), newest window first. */
export async function fetchPoolWindows(
  client: SpryGraphClient,
  args: { pool: string; first?: number },
): Promise<SpryFeeWindowRow[]> {
  const data = await client.request<{ spryFeeWindows?: SpryFeeWindowRow[] }>(POOL_WINDOWS_QUERY, args);
  return data.spryFeeWindows ?? [];
}

/** Per-tier aggregates, ordered by volume. */
export async function fetchTiers(client: SpryGraphClient): Promise<TierRow[]> {
  const data = await client.request<{ tiers?: TierRow[] }>(TIERS_QUERY);
  return data.tiers ?? [];
}

/**
 * PositionManager ERC-721s owned by a wallet, newest first. Not Spry-filtered
 * (see POSITIONS_BY_OWNER_QUERY); resolve poolKeys on-chain and intersect with
 * fetchPoolsByIds.
 */
export async function fetchPositionsByOwner(
  client: SpryGraphClient,
  args: { owner: string; first?: number },
): Promise<PositionRow[]> {
  const data = await client.request<{ positions?: PositionRow[] }>(POSITIONS_BY_OWNER_QUERY, {
    ...args,
    // oxlint-disable-next-line universe-custom/no-tolowercase-address-currencyid -- the subgraph stores owners lowercase; @spry/* cannot depend on packages/uniswap helpers
    owner: args.owner.toLowerCase(),
  });
  return data.positions ?? [];
}

/** Every ModifyLiquidity initiated by a wallet (raw / script-seeded liquidity attribution). */
export async function fetchModifiesByOrigin(
  client: SpryGraphClient,
  args: { origin: string; first?: number },
): Promise<ModifyRow[]> {
  const data = await client.request<{ modifyLiquidities?: ModifyRow[] }>(MODIFIES_BY_ORIGIN_QUERY, {
    ...args,
    origin: args.origin.toLowerCase(),
  });
  return data.modifyLiquidities ?? [];
}

/** Pool identity + state + token metadata for a set of poolIds (lowercased). Missing id == not a Spry pool. */
export async function fetchPoolsByIds(client: SpryGraphClient, ids: string[]): Promise<PositionPoolRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const data = await client.request<{ pools?: PositionPoolRow[] }>(POOLS_BY_IDS_QUERY, {
    ids: ids.map((id) => id.toLowerCase()),
  });
  return data.pools ?? [];
}
