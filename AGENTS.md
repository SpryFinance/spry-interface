# AGENTS.md

This file provides guidance to AI agents when working with code in this
repository. Always run lint, typecheck, and the related tests after making
changes, and before considering a task complete.

## Project overview

This is the **Spry interface**: a fork of the Uniswap universe monorepo
(pinned at `web/5.148.6`, commit `417e7724`) trimmed to a single app and to
Spry's deployed chains. Only **`apps/web/`** exists (the mobile and extension
apps are not part of this fork). The app is a Uniswap-v4-only DEX interface for Spry
(dynamic-fee hook pools) running on Spry's deployed chains: **Unichain Sepolia
(1301)** and **Base Sepolia (84532)** (Unichain Sepolia is the default). The
chain set, addresses, and RPCs live in `@spry/config`; gate per chain with
`isSpryChain(chainId)` / `SPRY_DEPLOYED_CHAIN_IDS`, never a hardcoded id.

Read [README.md](README.md) first: it describes the local-rails architecture
(the Uniswap gateway does not serve these testnets, so quotes, LP transactions,
positions, and token metadata are produced client-side from each chain and its
Spry subgraph), the reviewability contract, and the key invariants.

## Commands

```bash
# setup (Node must be exactly 22.22.2; bun is the package manager - npm is blocked)
bun install
bun web dev                      # vite dev server at http://localhost:3000

# build
bun web build:production         # Cloudflare Worker build under apps/web/build/

# quality gates - run all of these on what you touched
bunx oxlint -c oxlint.config.ts <files>          # lint (oxc, NOT eslint)
bunx oxfmt <files>                               # format (oxc, NOT prettier)
bunx tsgo --noEmit -p apps/web/tsconfig.json     # typecheck the web app
bunx tsgo --noEmit -p packages/uniswap/tsconfig.json
cd apps/web && bunx vitest run <test files>      # unit tests (vitest, per package)
cd packages/uniswap && bunx vitest run <test files>
```

Gotchas the hard way:

- `tsgo` output is ANSI-colored. Strip it before grepping:
  `bunx tsgo --noEmit -p ... 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep "error TS"`.
- `nx typecheck web` does NOT reliably check `apps/web/src` (a pre-existing
  `functions/` project-reference issue makes it bail early). Use the direct
  tsgo invocation above.
- Known pre-existing failures on main (not yours to fix in passing):
  `apps/web/src/state/activity/polling/retry.test.ts` has one tsgo error, and
  a handful of `useLiquidityUrlState` tests fail.
- Running `oxlint` with the TypeScript config requires Node >= 22.18
  (`oxlint.config.ts`); make sure the nvm Node 22.22.2 is on PATH, not an
  older system Node.

## Architecture pointers

- **Local rails seam pattern**: upstream query files call
  `maybeSpryLocalX(params)` first and fall through to the gateway client when
  it returns `undefined`. Swap seams live under
  `packages/uniswap/src/features/transactions/swap/services/tradeService/`
  (`spryLocalQuote`, `sprySwapApproval`, `sprySwapTransaction`); LP seams in
  `packages/uniswap/src/data/apiClients/liquidityService/spryLocalLiquidity.ts`
  (claim / increase / decrease / approval check / pool lookup / create),
  intercepted in `liquidityQueries.ts`.
- **Positions data**: `apps/web/src/features/Liquidity/spry/useSpryWalletPositions.ts`
  (subgraph discovery + one `StateView`/`PositionManager` multicall). Two
  position kinds: `PositionManager` ERC-721s (numeric tokenId) and raw
  `PoolManager` positions seeded through `PoolModifyLiquidityTest` with
  `salt = bytes32(owner)` (synthetic tokenIds `spry-raw-<poolId>|<tl>|<tu>|<router>`).
- **Token resolution**: `packages/uniswap/src/features/dataApi/sprySearchTokens.ts`
  feeds both search (`useSearchTokens`) and the `useCurrencyInfo` fallback.
- **Spry UI**: `apps/web/src/features/Liquidity/spry/` (tier selector, tier
  badges, fee sparkline) and the swap-form fee widgets.
- **Addresses / chain config**: `packages/spry-config` (committed source, not
  env vars). New external hosts must be added to
  `apps/web/public/csp.json`.

## Conventions that block PRs if missed

- **`SPRY:` comments** on every edit inside upstream files (what changed, why).
- **`RESTORE FOR MAINNET`** notes on testnet-only gates, with the original
  upstream code kept inline so re-enabling is a grep.
- **packages/uniswap targets pre-ES2020**: no BigInt literals (`0n`); use
  `BigInt(0)` constructors. `apps/web` is fine with literals.
- Custom oxlint rules you will hit:
  - `universe-custom/no-tolowercase-address-currencyid`: never
    `.toLowerCase()` an address or currencyId; use `areAddressesEqual(...)` or
    `normalizeTokenAddressForCache(...)` from `packages/uniswap`. (bytes32
    poolIds are exempt but need an inline disable with a justification.)
  - `no-restricted-syntax` on hex-string casts: use viem's `getAddress`.
  - `max-params: 2` (use an options object), `complexity: 30` (extract
    helpers), `max-lines` (split files), `no-bitwise` in packages/* (use
    `%` / `/` arithmetic on bigints or move to apps/web).
- Styling is **Tamagui** via `ui/src`; breakpoints are max-width inclusive
  (`sm`=450, `md`=640, `lg`=768, `xl`=1024, `xxl`=1280).
- State: Redux for complex global state, Zustand for simple shared state (no
  new Jotai). React Query (`useQuery`) directly for data fetching.
- i18n: user-facing strings go through `useTranslation`; run
  `bun i18n:extract` after adding keys. The brand is **Spry** in all locales.

## Key invariants (do not violate)

- Execution pricing comes from the on-chain `V4Quoter` and live `StateView`
  reads only. The `@spry/fee` JS curve is for charts/preview.
- Fees are V4 pips (1_000_000 = 100%); never render the `0x800000`
  dynamic-fee sentinel as a number.
- Spry positions are always full range; the create flow pins the range.
- Tier (tick spacing) is part of the pool ID; the same pair can exist in all
  five tiers.

## Testing guidelines

- Test behaviors, not implementations; update existing tests touched by your
  change.
- Browser verification of UI changes matters here (much of the surface is
  breakpoint-dependent): check desktop and the `sm` mobile width.
- Anything transaction-shaped should be verified against a live Spry chain by
  `eth_call` simulation where possible (the LP and swap rails were landed that
  way).

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->
