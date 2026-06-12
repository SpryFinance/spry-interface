# apps/web integration plan (brief section 15)

> **Historical document.** This was the integration plan written before the
> fork landed. The plan has been executed (and exceeded: the full LP lifecycle
> including pool creation now runs on local rails); see the root
> [README](../README.md) for the current state of the app.

The brief's section 15 deliverable, grounded in the **real upstream tree** rather
than from memory. All paths below are verified against the pinned upstream.

## 0. Upstream pin and stack

- **Fork target:** `Uniswap/interface`, the web app at `apps/web`.
- **Pin:** tag `web/5.148.6` = commit `417e7724be749609854223b7b6718e69a0a00d32`.
- **Stack (important: the brief was written against an older yarn+turbo era):**
  - Package manager: **bun** `>=1.3.11`. npm is hard-blocked (`"npm": "please-use-bun"`).
  - Node: **exactly `22.22.2`** (`engines.node = "=22.22.2"`).
  - Monorepo orchestration: **nx**. Web app bundler: **Vite** (`vite.config.mts`).
  - Workspaces: `apps/*`, `packages/*`, `config/*`, `tools/uniswap-nx`, `labs/*`.
- **Why this isn't built in the current dev environment:** it needs bun + Node
  22.22.2 and a large `bun install` across 3 apps + 24 packages (incl. native
  modules). The fork's install/build happens in an environment that has those.

## 1. Target repo structure (after the fork lands)

`spry-interface` becomes the bun + nx monorepo fork:

- Bring in upstream **`apps/web`** and the **12 workspace packages it imports**:
  `uniswap`, `ui`, `utilities`, and `@universe/{api, chains, config, encoding,
  gating, notifications, prices, sessions, websocket}` (plus whatever those pull
  transitively from `packages/*`).
- Bring in the **root config**: `package.json`, `bunfig.toml`, `.npmrc`,
  `.nvmrc`, `nx.json`, `tsconfig.base.json`, `tsconfig.json`, `patches/`,
  `config/`, and the `scripts/` the web build uses. Regenerate `bun.lock` via
  `bun install`.
- **Drop** `apps/mobile`, `apps/extension`, `labs/*`, and packages used only by
  mobile/extension (e.g. `wallet`, `mycelium`, `hashcash-native`, `datadog-cloud`
  if not in web's dep graph).
- **The four `@spry/*` packages move under `packages/`** (`spry-fee`,
  `spry-config`, `spry-slippage`, `spry-sdk`). The `packages/*` workspace glob
  picks them up automatically. Their `package.json`/`tsconfig.json` reconcile to
  extend the upstream root config; the temporary npm-workspace bootstrap
  (`/package.json`, `/tsconfig.base.json`, `/vitest.config.ts`, `package-lock.json`)
  is dropped in favor of upstream's.
- `tools/contract-diff/` stays as-is (a read-only Foundry tool, not a workspace
  package).

## 2. (a) apps/web modules to KEEP / REWIRE / REMOVE

### Keep and rewire (Spry-specific changes)

| Surface | Real paths | Spry change |
|---|---|---|
| Swap page + settings | `pages/Swap/*`, `pages/Swap/settings/{useWebSwapSettings.ts, OneClickSwap.tsx}` | Swap-only (drop Limit/Buy/Sell tabs); wire dynamic-fee UI; keep deadline |
| Swap execution | `hooks/useSwapCallback.tsx` | Rewire to build calldata via `@spry/sdk` (SpryRouter), size limits via `@spry/slippage`, price via `V4Quoter` |
| Swap details UI | `features/Swap/{SwapDetails,SwapLineItem,SwapPreview,SwapBottomCard}.tsx`, `features/Swap/CurrencyInputPanel/*`, `features/Swap/state`, `features/Swap/hooks` | Show current dynamic fee next to tier cap (section 7.3); remove route/UniswapX line items |
| Slippage logic | `utils/{slippage.ts, calculateSlippageAmount.ts, validateUserSlippageTolerance.ts}`, `hooks/useTransactionDeadline.ts` | Replace with `@spry/slippage` two-buffer model (price slippage + fee headroom) |
| Liquidity / positions (v4) | `pages/{Positions, PoolDetails, PoolFinder, AddLiquidity, CreatePosition, IncreaseLiquidity, RemoveLiquidity, Liquidity}`, `features/Liquidity/*` | Data model unchanged (canonical PositionManager); fee-tier picker becomes tier picker; full-range default |
| Fee-tier picker | `features/Liquidity/{FeeTierSelector.tsx, FeeTierSearchModal.tsx, Create/DynamicFeeTierSpeedbump.tsx, utils/feeTiers.ts, hooks/useAllFeeTierPoolData.ts}` | Replace with the Spry tier picker (STABLE..EXOTIC) from `@spry/fee`; show base/cap as informational |
| Token infrastructure (keep ~unchanged) | `components/SearchModal/{CurrencySearch, CurrencySearchModal, CurrencyList}`, token lists, balances, Permit2/allowances, `pages/TokenDetails/*` | Keep |
| Pools explore (Spry-filter) | `pages/Explore/*`, `pages/Explore/state/topPools*` | Feed from the Spry subgraph; every indexed pool is already Spry (no hook filtering) |
| Portfolio / activity | `pages/Portfolio/*` | Mostly unchanged; swap history shows the per-swap dynamic fee |
| Data layer | `apps/web/src/appGraphql/data` + `packages/uniswap` (GraphQL client + generated types) | Point at the Spry subgraph; re-run codegen against the Spry schema; add Spry fields/queries (section 13) |
| Route config | `pages/RouteDefinitions.tsx`, `pages/paths.ts`, `utils/urlRoutes.ts` | Drop the removed routes below |

### Remove

| Surface | Real paths / routes | Reason |
|---|---|---|
| Limit orders | `features/Swap/CurrencyInputPanel/LimitPriceInputPanel/*`, `features/Swap/state/limit/*`, `components/LimitDisclaimer.tsx`; routes `/limit`, `/limits` | Not offered (section 0.5) |
| Buy / Sell (fiat) | routes `/buy`, `/sell`; `components/ActionTiles/BuyActionTile.tsx`; fiat-on-ramp | Not offered (section 0.5) |
| Send | route `/send` | Out of the keep-list |
| NFT marketplace | NFT pages/features (collections, trading) | Not core. NOTE: v4 LP position NFTs stay (PositionManager ERC-721) |
| v2 / v3 + migration | `pages/{AddLiquidityV2, AddLiquidityV3, Migrate, LegacyPool}`; routes `/positions/v2|v3`, `/pool/v2*`, `/add/v2`, `/remove/v2/*`, `/migrate/*` | Spry is v4-only |
| Governance | routes `/vote/*`, `/create-proposal` | Out of scope |
| Trade options / routing / UniswapX | `features/Swap/SwapRoute.tsx`, `features/Swap/components/RouterLabel/*`, `hooks/{useUniswapXSwapCallback.ts, useIsUniswapXSupportedChain.ts}`, `lib/hooks/routing/*` | Single fixed path: SpryRouter -> PoolManager.unlock -> SpryHook (section 0.3) |
| Auctions / Beta / Wrapped | `pages/{Liquidity/CreateAuction, Beta, Wrapped}`; route `/liquidity/launch-auction*` | Not in scope; trim |

When in doubt: delete the route and its nav entry, keep a shared component if a
kept surface imports it.

## 3. (b) New Spry modules

**Already built in this repo (move under `packages/`):**

- `@spry/fee` - tier table, cached `tierParams`, JS four-zone curve (charts/preview).
- `@spry/config` - per-chain addresses, subgraph URL, block window, Spry-pool predicate.
- `@spry/slippage` - the reworked max-slippage (section 7).
- `@spry/sdk` - SpryRouter calldata builders + cached SpryHook views client.

**To add inside `apps/web` (behavior now; styling is a later pass, section 0.6):**

- Swap-submit module wiring `V4Quoter` (price) + `@spry/slippage` (limits) +
  `@spry/sdk` (calldata, multicall, Permit2) into `useSwapCallback.tsx`.
- The tier picker replacing the fee-tier picker on create/add-liquidity.
- Spry widgets (section 9): tier badge, live dynamic fee, fee-curve chart + live
  marker, window countdown, pre-swap fee preview, recent-swaps panel (zone /
  dispatch), pool analytics, tiers overview page, swap receipt dynamic fee.
- Spry GraphQL fragments/queries (section 13) in `appGraphql` + codegen types.

## 4. Suggested sequencing

1. Land the monorepo fork: `apps/web` + the 12 deps + root config + the four
   `@spry/*` packages under `packages/`; `bun install` green; app boots.
2. Prune the removed routes/surfaces (section 2, Remove) and their nav entries.
3. Wire `@spry/config` (chains, RPC, addresses) into the connection/chains layer.
4. Swap rewire: `useSwapCallback` -> `@spry/sdk` + `@spry/slippage` + Quoter;
   remove the routing/UniswapX surface; Swap-only tab.
5. Tier picker on create/add-liquidity; full-range default with a soft warning.
6. Spry widgets (section 9).
7. Data layer -> Spry subgraph endpoint; re-run codegen; wire the section 13 queries.

Each step is independently reviewable, keeping the diff against upstream
`apps/web` small and auditable (section 13 deliverable).
