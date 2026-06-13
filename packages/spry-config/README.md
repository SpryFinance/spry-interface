# @spry/config

Per-chain Spry configuration: contract addresses, subgraph endpoints, block
window, and the Spry-pool predicate. Depends on `@spry/fee` for the fee/tick
domain.

## Status

Supported chains, in display order: **Unichain Sepolia** (1301), **Base
Sepolia** (84532), **Sepolia** (11155111).

**Unichain Sepolia and Base Sepolia are LIVE and verified on-chain** (SpryHook,
SpryRouter, canonical V4Quoter + StateView + PoolManager + PositionManager +
Permit2, `startBlock` = the hook deploy block, `blockWindowHint` from the live
`BLOCK_WINDOW()` - 60 on Unichain, 30 on Base, the `subgraphUrl` Goldsky
endpoint, and an `rpcUrl`). Each also carries the optional
`poolModifyLiquidityTest` address (the canonical v4 test router): seeded "raw"
liquidity positions live under it, and the app's local LP rails target it for
those positions.

**Sepolia is pre-deployment**: `spryHook`, `spryRouter`, `quoter`, and
`stateView` are placeholders (`0xffff...ffff`) and `subgraphUrl` is null;
`poolManager` / `positionManager` / `permit2` / `rpcUrl` are real.

`isSpryDeployed(config)` returns `true` once the hook + router are real;
`isSpryChain(chainId)` and `SPRY_DEPLOYED_CHAIN_IDS` (Unichain Sepolia first)
are the convenience forms the rails / UI gate on per chain. `DEFAULT_CHAIN_ID`
is the first deployed chain (Unichain Sepolia).

`blockWindowHint` is informational; the authoritative window is the on-chain
`SpryHook.BLOCK_WINDOW()` (read once and cache).

## TODO

- Unichain Sepolia and Base Sepolia are fully configured. Pools populate the
  subgraph as they are created/seeded on each chain.
- Sepolia: fill `spryHook`, `spryRouter`, `quoter`, `stateView`, `startBlock`,
  and `subgraphUrl` when deployed there.

## API

```ts
import {
  getSpryConfig, requireSpryConfig, DEFAULT_CHAIN_ID,
  isSpryPoolKey, classifySpryPoolKey, isSpryDeployed,
  PERMIT2_ADDRESS,
} from '@spry/config';

const config = requireSpryConfig(DEFAULT_CHAIN_ID);
config.addresses.poolManager; // real
isSpryDeployed(config);       // true on Base Sepolia (the default chain); false on the pre-deployment chains
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
cd packages/spry-config && bunx vitest run
```
