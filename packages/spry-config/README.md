# @spry/config

Per-chain Spry configuration: contract addresses, subgraph endpoints, block
window, and the Spry-pool predicate. Depends on `@spry/fee` for the fee/tick
domain.

## Status

Supported chains: **Sepolia** (11155111), **Base Sepolia** (84532),
**Unichain Sepolia** (1301).

**Base Sepolia is fully wired and verified on-chain** (SpryHook, SpryRouter,
canonical V4Quoter + StateView + PoolManager + PositionManager + Permit2,
`startBlock` = the hook deploy block, `blockWindowHint` = 30 from the live
`BLOCK_WINDOW()`). The only remaining field is `subgraphUrl` (null until the
Spry subgraph is deployed).

**Sepolia and Unichain Sepolia are pre-deployment**: `spryHook`, `spryRouter`,
`quoter`, and `stateView` are placeholders (`0xffff...ffff`), and `subgraphUrl`
is null. Their `poolManager` / `positionManager` / `permit2` are real.

`isSpryDeployed(config)` returns `true` once the hook + router are real (Base
Sepolia today); use it to gate Spry-specific UI per chain.

`blockWindowHint` is informational; the authoritative window is the on-chain
`SpryHook.BLOCK_WINDOW()` (read once and cache).

## TODO

- Base Sepolia: set `subgraphUrl` once the Spry subgraph is deployed.
- Sepolia / Unichain Sepolia: fill `spryHook`, `spryRouter`, `quoter`,
  `stateView`, `startBlock`, and `subgraphUrl` when deployed there.

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
