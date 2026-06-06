# @spry/subgraph

The Spry subgraph data layer: typed GraphQL queries (brief section 13) and a
thin fetch client. Depends on `@spry/config` (endpoint) and `@spry/fee` (enums).

Use it for history, aggregates, and analytics (pool lists, recent swaps, fee
stats, the fee-curve windows, the tiers overview). Execution still prices
through the `V4Quoter`, never the subgraph. Every indexed pool is already a Spry
pool, so subgraph-fed views need no hook filtering.

## Usage

```ts
import { createSpryGraphClientForChain, fetchPools, fetchPoolSwaps, fetchTiers } from '@spry/subgraph';
import { ChainId } from '@spry/config';
import { formatFeePercent } from '@spry/fee';

const client = createSpryGraphClientForChain(ChainId.BASE_SEPOLIA);
const pools = await fetchPools(client, { first: 50 });
formatFeePercent(pools[0].feeTier); // current dynamic fee, e.g. "0.42%"
```

Also exported: `createSpryGraphClient(url, opts)`, the raw query documents
(`POOLS_QUERY`, `POOL_SWAPS_QUERY`, `POOL_WINDOWS_QUERY`, `TIERS_QUERY`), and the
row types (`PoolRow`, `SwapRow`, `TierRow`, `SpryFeeWindowRow`). Numeric fields
arrive as strings (BigInt / BigDecimal); render with `@spry/fee` helpers.

The client returns `data` whenever present (GraphQL partial-data semantics) and
throws with the error messages when there is none.

## Status

The deployed Base Sepolia subgraph (Goldsky) is **healthy and serving data**
(`hasIndexingErrors: false`). The live test introspects the `Pool` type, checks
`_meta`, and runs the section-13 queries end-to-end. Results are empty until Spry
pools are created on-chain on Base Sepolia.

## Test

```bash
npm test --workspace @spry/subgraph
# live schema check against Goldsky:
SPRY_LIVE_SUBGRAPH=1 npx vitest run packages/spry-subgraph/test/live.test.ts
```
