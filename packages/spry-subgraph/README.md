# @spry/subgraph

The Spry subgraph data layer: typed GraphQL queries (brief section 13) and a
thin fetch client. Depends on `@spry/config` (endpoint) and `@spry/fee` (enums).

Use it for history, aggregates, analytics, and **discovery** (pool lists,
recent swaps, fee stats, the fee-curve windows, the tiers overview, and the
positions / liquidity-modification queries the app's positions list is built
on). Execution still prices through the `V4Quoter`, and live position amounts
come from `StateView` chain reads, never the subgraph. Every indexed pool is
already a Spry pool, so subgraph-fed views need no hook filtering.

## Usage

```ts
import { createSpryGraphClientForChain, fetchPools, fetchPoolSwaps, fetchTiers } from '@spry/subgraph';
import { ChainId } from '@spry/config';
import { formatFeePercent } from '@spry/fee';

const client = createSpryGraphClientForChain(ChainId.BASE_SEPOLIA);
const pools = await fetchPools(client, { first: 50 });
formatFeePercent(pools[0].feeTier); // current dynamic fee, e.g. "0.42%"
```

Position discovery for the app's "Your positions" surface:

```ts
import { fetchPositionsByOwner, fetchModifiesByOrigin, fetchPoolsByIds } from '@spry/subgraph';

const nftPositions = await fetchPositionsByOwner(client, { owner });        // PositionManager ERC-721s
const rawModifies = await fetchModifiesByOrigin(client, { origin: owner }); // raw router positions (grouped by pool+ticks by the caller)
const pools = await fetchPoolsByIds(client, poolIds);                       // metadata + tier + zone swap counts; doubles as the Spry filter
```

Also exported: `createSpryGraphClient(url, opts)`, the raw query documents
(`POOLS_QUERY`, `POOL_SWAPS_QUERY`, `POOL_WINDOWS_QUERY`, `TIERS_QUERY`,
`POSITIONS_BY_OWNER_QUERY`, `MODIFIES_BY_ORIGIN_QUERY`, `POOLS_BY_IDS_QUERY`),
and the row types (`PoolRow`, `SwapRow`, `TierRow`, `SpryFeeWindowRow`,
`PositionRow`, `ModifyRow`, `PositionPoolRow`). Numeric fields arrive as
strings (BigInt / BigDecimal); render with `@spry/fee` helpers. The subgraph
stores all hex ids lowercase, and `Pool.feeTier` is the **current** dynamic
fee in pips (the pool key's fee is always the `0x800000` dynamic-fee flag).

The client returns `data` whenever present (GraphQL partial-data semantics) and
throws with the error messages when there is none.

## Status

Spry ships a subgraph per deployed chain (Goldsky). The live test iterates over
every `SPRY_DEPLOYED_CHAIN_IDS` endpoint (Unichain Sepolia, Base Sepolia),
introspecting the `Pool` type, checking `_meta`, and running the queries; the
app's positions list, fee sparklines, and tier stats are all fed from these.
Per-chain swap-reproduction is skipped (with a console note) on a chain that has
no pools indexed yet.

## Test

```bash
cd packages/spry-subgraph && bunx vitest run
```

The live schema check (`test/live.test.ts`) runs by default - no env var - and
covers both live subgraphs.
