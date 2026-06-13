# Spry interface

The Spry web app: a thin, reviewable overlay on the Uniswap v4 web interface.
Spry is Uniswap v4 plus exactly one custom hook (`SpryHook`) and one swap-only
router (`SpryRouter`), running on the canonical, unmodified v4 `PoolManager` and
`PositionManager`. Everything not Spry-specific stays plain v4, and the diff
against upstream is meant to stay small and auditable.

## Current state

The upstream monorepo fork (pinned at `web/5.148.6`, commit `417e7724`) is
landed and **fully functional** as a single-protocol, Uniswap-v4-only interface
on Spry's deployed chains: **Unichain Sepolia (1301)** and **Base Sepolia
(84532)** (Unichain Sepolia is the default). The chains, addresses, and RPCs
live in [`@spry/config`](packages/spry-config/README.md); a chain becomes
available the moment its Spry contracts are deployed there. Both core product
surfaces work end to end against the live chains:

**Swap** - quote (V4 `Quoter`, reflecting the `SpryHook` dynamic fee across
every candidate route and tier), approve (ERC-20 to `SpryRouter`), swap
(`SpryRouter` calldata), confirmation (RPC receipt). The swap form carries a
per-pool dynamic fee/tier/zone widget (all tiers of a pair, grouped by hop,
best route highlighted), and the review shows the exact dynamic fee the swap
pays.

**Pool (the full LP lifecycle)** -

- **Your positions**: discovered through the Spry subgraph and priced from
  live chain reads (`StateView` / `PositionManager` multicalls). Cards show
  pair-denominated principal and uncollected fees, the position's Spry tier
  badge, In Pool / Closed status, and the pool's alert / danger zone swap
  counts, with a per-pool dynamic-fee sparkline.
- **Collect fees / add / remove liquidity**: transactions are built locally
  and verified against the chain (collect simulations match the displayed
  uncollected fees exactly).
- **New position**: a Spry-native create flow. The fee-tier step presents the
  five Spry tiers (icons, typical pairs, base-to-cap fee bands) instead of a
  static fee list, and selecting a tier pins the `SpryHook` automatically.
  If the pair + tier already has a pool, the flow routes into the shared
  Add-liquidity modal against your live position. If not, the app **creates
  the pool**: one `PositionManager` multicall that initializes the pool at
  your chosen price and mints the first full-range position, with Permit2
  approvals sequenced in front of it. Spry positions are always full range.
- **Token selection**: search by symbol or by pasted address resolves locally
  (common bases, then the subgraph, then live on-chain ERC-20 metadata), so
  any token on the chain can be selected.

### Local rails (no Uniswap backend)

The Uniswap Trading API gateway and GraphQL backends do not serve Base
Sepolia, so every data and transaction path runs on **local rails**: the
client prices, builds, and confirms everything itself from the chain and the
Spry subgraph, behind the same query seams the upstream code already calls.

- **Swap rails**: `spryLocalQuote` (on-chain `Quoter` pricing),
  `sprySwapApproval`, `sprySwapTransaction` (`@spry/sdk` calldata). Trade
  objects still flow through the upstream `transformQuoteToTrade` pipeline, so
  everything downstream (review modal, slippage, settings) is stock upstream
  code.
- **LP rails**: `spryLocalLiquidity` intercepts all six liquidity-service
  query seams (claim fees / increase / decrease / approval check / pool lookup
  / create). Existing positions transact through the position's own channel
  (the seeded raw-position router or `PositionManager` by NFT tokenId via the
  v4 SDK); new pools go through `PositionManager` with Permit2.
- **Positions data**: `useSpryWalletPositions` (subgraph discovery + one
  multicall for live state) replaces the gateway positions list.
- **Token resolution**: `sprySearchTokens` + a local fallback inside
  `useCurrencyInfo` replace gateway token search and metadata.

Pruned from upstream (gone, not hidden): limit orders, fiat buy/sell (and the
fiat on-ramp integration web-wide), the trade-options / routing-preference /
UniswapX surface, **all Solana/SVM support** (wallet adapters, trade service,
Jupiter clients, dependencies), **all cross-chain / bridging functionality**
(bridge trades, the Across routing surface, the wormhole bridged-asset
withdraw flow), the launch-auction (Toucan) surface, and the **v2/v3 LP
surfaces** (Spry is v4-only: migrate flows, v2/v3 add/remove pages, the
create-flow protocol picker). Type-level members that exhaustive upstream type
maps require (e.g. the `Platform.SVM` enum member, the generated
`Routing.BRIDGE`/`JUPITER` members) are deliberately stranded and routed to
no-op implementations.

Intentionally gated for the testnet phase (hidden or disabled with `SPRY:`
restore comments inline, to be re-enabled for mainnet): the Explore and
Portfolio navs (coming-soon badges), position-card navigation to the detail
page (its data source is still gateway-fed), the card menu's "Pool info"
option, the "Get help" buttons (they linked to Uniswap's support desk), the
"Adding hook" speedbump (the only hook on Spry is the pre-approved
`SpryHook`), and the Uniswap help-center learn-more tiles.

```
spry-interface/
├── apps/
│   └── web/            the forked Uniswap web app (Vite + Cloudflare Worker)
├── packages/
│   ├── spry-fee/       @spry/fee       tier table + cached tierParams + JS four-zone curve
│   ├── spry-config/    @spry/config    per-chain addresses, subgraph URL, Spry-pool predicate
│   ├── spry-slippage/  @spry/slippage  dynamic-fee-aware slippage / fee-tolerance
│   ├── spry-sdk/       @spry/sdk       SpryRouter builders + SpryHook/V4Quoter/StateView clients
│   ├── spry-subgraph/  @spry/subgraph  typed Spry subgraph queries + fetch client
│   └── ...             upstream workspace packages (uniswap, ui, api, utilities, ...)
├── tools/
│   └── contract-diff/  read-only Foundry harness: generates the @spry/fee differential fixture
├── docs/               fork-landing runbook + integration plan (historical)
└── package.json        upstream bun + nx workspace root
```

## Development

Prerequisites:

- **Node 22.22.2** (`nvm install 22.22.2 && nvm use 22.22.2` - the preinstall
  check enforces it)
- **bun** (package manager and script runner)

```bash
bun install        # install + link the workspaces
bun web dev        # vite dev server at http://localhost:3000
```

Quality gates (run after changes):

```bash
# lint + format (oxc - NOT eslint/prettier)
bunx oxlint -c oxlint.config.ts <files>
bunx oxfmt <files>

# typecheck (tsgo; output is ANSI-colored - strip before grepping)
bunx tsgo --noEmit -p packages/uniswap/tsconfig.json
bunx tsgo --noEmit -p apps/web/tsconfig.json

# unit tests, per package
cd packages/uniswap && bunx vitest run
cd apps/web && bunx vitest run

# the @spry/* packages have their own suites
cd packages/spry-fee && bunx vitest run
```

Note: `nx typecheck web` does not reliably check `apps/web/src` (a pre-existing
`functions/` project-reference issue makes it bail early), so web changes are
verified by tsgo on the app tsconfig, vitest, oxlint, and the build.

## Deployment

The app deploys as a **Cloudflare Worker**: the Vite build (via
`@cloudflare/vite-plugin`) produces the static client assets plus a worker
(`apps/web/functions/main.ts`) that serves them, injects meta tags, and sets
frame headers. Worker names and per-environment variables live in
[`apps/web/wrangler-vite-worker.jsonc`](apps/web/wrangler-vite-worker.jsonc)
(production worker `app`, staging worker `app_staging`).

```bash
# 1) build (from the repo root; needs Node 22.22.2 + bun on PATH)
bun web build:production         # build:staging also exists (same .env, staging worker)

# 2) deploy with wrangler (4.x, already a devDependency)
#    auth: `bunx wrangler login`, or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
cd apps/web
bunx wrangler deploy --config build/app/wrangler.json
```

The build writes everything under `apps/web/build/`: `client/` (static assets)
and a per-worker directory containing the compiled worker and a resolved
`wrangler.json` (this is the config to pass to `wrangler deploy`). Attach your
custom domain to the worker in the Cloudflare dashboard (or add a `routes`
entry to the wrangler config).

A static-only deploy also works (`DEPLOY_TARGET=vercel` exists for Vercel), but
the Worker path is the supported one: it serves the SPA fallback, security
headers, and meta-tag injection.

### Environment variables

All app configuration is **build-time** (Vite inlines `process.env.*` values;
see [`packages/config/src/BaseConfig.ts`](packages/config/src/BaseConfig.ts)
for the full schema). There is a single **`apps/web/.env`** loaded for every
build mode (dev, staging, production) - no per-mode `.env.production` /
`.env.staging` split. The checked-in values are inherited Uniswap **public dev
keys** - fine for local dev, but see the launch checklist below before
deploying to your own domain. For machine-specific secrets, add an untracked
`apps/web/.env.local` (it overrides `.env` and is gitignored).

Required:

| Variable | Purpose |
| --- | --- |
| `APP_ID` | Must be `web`. |
| `REACT_APP_WALLET_CONNECT_PROJECT_ID` | WalletConnect Cloud project ID. **Must be replaced before deploying**: the inherited ID is domain-allowlisted to Uniswap and will reject connections from your domain. Register at cloud.walletconnect.com and allowlist your domain. |

Optional (the app degrades gracefully without them):

| Variable | Purpose |
| --- | --- |
| `REACT_APP_STATSIG_API_KEY` | Feature-flag service key. The checked-in value is a placeholder, so flags fall back to their code defaults (current behavior); set a real key to use Statsig. |
| `PRIVY_APP_ID`, `PRIVY_CLIENT_ID` | Privy embedded wallet. Unset by default (Spry uses the standard wallet modal); set both, with your own Privy project, only to enable embedded wallets. |
| `REACT_APP_ANALYTICS_ENABLED` | Amplitude analytics on/off. Unset (off) by default so events don't flow to Uniswap's pipeline; enable once you have your own. |
| `REACT_APP_INFURA_KEY`, `REACT_APP_QUICKNODE_ENDPOINT_NAME`, `REACT_APP_QUICKNODE_ENDPOINT_TOKEN` | RPC for non-Spry chains only. **The Spry chains do not use them** - each reads its own RPC (`rpcUrl`) from [`@spry/config`](packages/spry-config/README.md) (`https://sepolia.unichain.org`, `https://sepolia.base.org`); the UniRPC proxy is disabled for them. |
| `REACT_APP_TRADING_API_KEY` | `x-api-key` for the Trading API / Blockaid. Inert on the Spry chains (local rails replace the Trading API); kept as an inherited placeholder. |
| `REACT_APP_VERSION_TAG` | Version label shown in diagnostics. |
| `AWS_API_ENDPOINT`, `UNISWAP_GATEWAY_DNS` | Override hooks for the inherited Uniswap gateway endpoints (Apollo GraphQL + gateway v2). Not set in `.env` - the URLs are defaulted in [`apps/web/src/config.ts`](apps/web/src/config.ts) since they do not serve the Spry chains anyway (the local rails replace them). |
| `VITE_ENABLE_ENTRY_GATEWAY_PROXY` | Keep `false` in production (worker-side gateway proxying, staging-only). |

Worker runtime variables (set per environment in
`wrangler-vite-worker.jsonc`, not in `.env`):

| Variable | Purpose |
| --- | --- |
| `ENTRY_GATEWAY_API_URL` | Upstream gateway URL the worker proxies for meta/config endpoints. |
| `WEBSOCKET_URL` | Websocket backend URL. |

Spry-specific configuration is **not** environment-driven: contract addresses,
the subgraph URL, and the block window live in
[`packages/spry-config`](packages/spry-config/README.md) (per chain, committed
in source), and any new external host the browser must reach (RPC, subgraph)
must be added to the CSP allowlist in
[`apps/web/public/csp.json`](apps/web/public/csp.json) (`connect-src` is baked
into a meta tag for both dev and the deployed worker).

### Launch checklist

1. Register a **WalletConnect Cloud project** for your domain and set
   `REACT_APP_WALLET_CONNECT_PROJECT_ID` (the single hard requirement).
2. If you add any private keys, put them in an untracked `apps/web/.env.local`
   (or CI secrets) - the checked-in `apps/web/.env` is public.
3. Optionally provision your own Statsig key (feature flags) and analytics.
4. Verify `packages/spry-config` has the right addresses for the target chain,
   and that the RPC + subgraph hosts are in `csp.json`.
5. `bun web build:production`, deploy with wrangler, attach the domain.

## Upstream v4 vs Spry-specific (the reviewability contract)

To keep the diff against `Uniswap/interface` (`apps/web`) auditable, Spry code
is isolated from upstream code:

- **Spry-specific (new):** the `packages/spry-*` packages; the local swap
  rails (`spryLocalQuote`, `sprySwapTransaction`, `sprySwapApproval`); the
  local LP rails (`spryLocalLiquidity`, `useSpryWalletPositions`,
  `sprySearchTokens`, `buildEmptySpryPosition`); and the Spry UI
  (`SpryFeeWidget`, `SpryFeeInfo`, `SpryTierSelector`, `SpryTierBadge`,
  `SpryFeeSparkline`, `SpryTiersCard`). These are additive and clearly
  namespaced; shared-code edits carry `SPRY:` comments, and testnet-only
  gates carry `RESTORE FOR MAINNET` notes with the original code inline.
- **Upstream v4 (kept, lightly rewired):** swap, positions/LP, portfolio,
  ERC-20 token infrastructure (selector, balances, allowances + Permit2, token
  safety, token detail pages), and the pools explore list.
- **Removed:** limit orders, fiat buy/sell, the trade-options / routing /
  UniswapX surface, Solana/SVM support, cross-chain bridging, the launch
  auction, and the v2/v3 LP surfaces. Spry has a single fixed execution path
  for swaps (`SpryRouter` -> `PoolManager.unlock` -> `SpryHook`) and standard
  v4 channels for liquidity.

## The packages

- [`@spry/fee`](packages/spry-fee/README.md) - the tier table, the cached
  on-chain `tierParams`, and a faithful JS four-zone fee curve (bit-exact vs
  `SmartFeeLib.sol` by differential test). For charts and client-side preview
  only; execution pricing always uses the `V4Quoter`.
- [`@spry/config`](packages/spry-config/README.md) - per-chain canonical V4 and
  Spry addresses, the subgraph endpoint, the block window, and the Spry-pool
  predicate.
- [`@spry/slippage`](packages/spry-slippage/README.md) - the reworked
  max-slippage: `amountOutMin` / `amountInMax` that cover both price slippage
  and the dynamic fee rising toward the tier cap within a window.
- [`@spry/sdk`](packages/spry-sdk/README.md) - `SpryRouter` swap calldata
  builders (with path/adjacency guards), a cached `SpryHook` views client, a
  `V4Quoter` client (authoritative pricing), and a `StateView` reader. Built on
  viem; ABIs vendored from `spry-contracts`.
- [`@spry/subgraph`](packages/spry-subgraph/README.md) - typed GraphQL queries
  and a thin fetch client for the Spry subgraph (pools, swaps, tiers, fee
  windows, positions and liquidity modifications). Discovery and analytics
  only; live amounts always come from chain reads.

## Sibling repositories

This app integrates with three repos checked out alongside it under `../`:

- `spry-contracts` - `SpryHook`, `SpryRouter`, and the fee libraries; ABIs under
  `abis/`. Read-only from this repo.
- `spry-subgraph` - the Spry fork of Uniswap's v4-subgraph (deployed on
  Goldsky). Every indexed pool is a Spry pool.
- `token-list` - the ERC-20 token list.

## Key invariants the UI relies on

- Fees are V4 pips: `1_000_000` pips = 100%. Never render the `0x800000`
  dynamic-fee sentinel as a number.
- No protocol fee on Spry pools: `Swap.fee == lpFee == SpryFee.fee`; output
  amounts are the complete user-facing values.
- The hook is single, immutable, and non-upgradeable: hardcode per chain; read
  `BLOCK_WINDOW` once and cache.
- Execution pricing is the `V4Quoter` only. The JS curve in `@spry/fee` is for
  charts and previews; never price a trade with it.
- The same pair can exist in multiple tiers: tier (tick spacing) is part of the
  pool ID, every tier-pool is a separate route, and the router quotes all of
  them and executes the best.
- Spry positions are **always full range** for the tier's tick spacing; the
  create flow pins the range and never exposes a range picker.
- Positions come in two kinds and the LP rails handle both: standard
  `PositionManager` ERC-721s (by tokenId), and "raw" `PoolManager` positions
  seeded through the canonical `PoolModifyLiquidityTest` router with
  `salt = bytes32(owner)`. Display amounts and uncollected fees always come
  from live `StateView` reads, never from subgraph aggregates.

## Roadmap

Remaining increments:

1. Position **detail page** on local rails (cards intentionally don't navigate
   on testnet until then).
2. Repoint Explore / pool analytics to `@spry/subgraph` and re-enable the
   Explore + Portfolio navs (currently coming-soon).
3. Sweep the remaining Uniswap marketing surfaces (landing page sections,
   support links in error boundaries).
4. Mainnet pass: re-enable the testnet gates (`RESTORE FOR MAINNET` markers),
   repoint help/support links at Spry channels, real WalletConnect / analytics
   keys, mainnet addresses in `@spry/config`.
5. Optional: split routing across tiers (the testnet pools are thin; a large
   exact-output can exceed any single tier's in-range liquidity today).

Visual / styling work is a separate later pass.
