# @spry/config

Per-chain Spry configuration: contract addresses, subgraph endpoints, block
window, and the Spry-pool predicate. Depends on `@spry/fee` for the fee/tick
domain.

## Status: pre-deployment

The three networks match exactly the ones the Spry subgraph indexes
(`spry-subgraph/networks.json`). Some addresses are real, others are
placeholders the deployer fills.

| Field | State |
|-------|-------|
| `poolManager`, `positionManager` | **Real** canonical V4 (copied from the subgraph's `networks.json`). |
| `permit2` | **Real** universal canonical Permit2. |
| `quoter` | **Placeholder.** Fill from the canonical v4-periphery deployment per chain. |
| `spryHook`, `spryRouter` | **Placeholder** (`0xffff...ffff`) until deployed. The hook address is CREATE2-mined at deploy. |
| `subgraphUrl` | `null` until chosen at deploy (The Graph / Goldsky). |
| `startBlock` | Provisional (canonical V4 deploy block; replace with the hook deploy block). |
| `blockWindowHint` | Informational only. The authoritative window is the per-chain `immutable`: read `SpryHook.BLOCK_WINDOW()` once on-chain and cache it. |

Supported chains: **Sepolia** (11155111), **Base Sepolia** (84532),
**Unichain Sepolia** (1301).

## TODO before testnet/mainnet use

1. Fill `quoter` with the canonical `V4Quoter` for each chain
   (https://docs.uniswap.org/contracts/v4/deployments).
2. Fill `spryHook` and `spryRouter` with the deployed addresses, and update
   `startBlock` to the hook deploy block.
3. Set `subgraphUrl` to the deployed Spry subgraph endpoint.
4. Confirm `blockWindowHint` against the value actually passed at deploy (or
   just read `BLOCK_WINDOW()` on-chain, which is the source of truth).

`isSpryDeployed(config)` returns `false` while the hook/router are placeholders;
use it to gate Spry-specific UI until deployment.

## API

```ts
import {
  getSpryConfig, requireSpryConfig, DEFAULT_CHAIN_ID,
  isSpryPoolKey, classifySpryPoolKey, isSpryDeployed,
  PERMIT2_ADDRESS,
} from '@spry/config';

const config = requireSpryConfig(DEFAULT_CHAIN_ID);
config.addresses.poolManager; // real
isSpryDeployed(config);       // false (pre-deployment)
```

## The Spry-pool predicate (brief section 2)

A v4 pool is a Spry pool iff all three hold: `hooks == SPRY_HOOK_ADDRESS`,
`fee == 0x800000` (the dynamic-fee flag), and `tickSpacing in {1,10,60,200,1000}`.

```ts
isSpryPoolKey({ hooks, fee, tickSpacing }, config); // boolean
classifySpryPoolKey(key, config); // null | 'wrong-hook' | 'not-dynamic-fee' | 'invalid-tick-spacing'
```

Apply this on every **non-subgraph** pool path (deep links, manual entry, a
freshly created pool, any raw on-chain `PoolKey`). Subgraph-fed views need no
such check: the Spry subgraph indexes only pools on `SpryHook`, so every pool it
returns is already Spry.

## Test

```bash
npm test --workspace @spry/config
```
