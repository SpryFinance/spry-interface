# Spry interface

The Spry web app: a thin, reviewable overlay on the Uniswap v4 web interface.
Spry is Uniswap v4 plus exactly one custom hook (`SpryHook`) and one swap-only
router (`SpryRouter`), running on the canonical, unmodified v4 `PoolManager` and
`PositionManager`. Everything not Spry-specific stays plain v4, and the diff
against upstream is meant to stay small and auditable.

## Current state

This repository is being built in increments. Right now it contains the
**foundation packages** that the forked web app will depend on. The upstream
Uniswap `apps/web` and shared `packages/*` have **not** been brought in yet.

```
spry-interface/
├── packages/
│   ├── spry-fee/       @spry/fee       tier table + cached tierParams + JS four-zone curve
│   ├── spry-config/    @spry/config    per-chain addresses, subgraph URL, Spry-pool predicate
│   ├── spry-slippage/  @spry/slippage  dynamic-fee-aware slippage / fee-tolerance (brief section 7)
│   └── spry-sdk/       @spry/sdk       SpryRouter calldata builders + cached SpryHook views client
├── tools/
│   └── contract-diff/ read-only Foundry harness: generates the @spry/fee differential fixture
├── package.json       workspace root (temporary bootstrap; see below)
├── tsconfig.base.json
└── vitest.config.ts
```

`@spry/fee` is verified **bit-exact** against the real on-chain Solidity by a
differential test (the `tools/contract-diff` harness compiles the sibling
`spry-contracts` sources read-only and dumps a fixture; the JS port matches it
with maxDiff 0 pips). Day-to-day `npm test` needs only the committed fixture,
not Foundry.

Both packages are source-only TypeScript (no build step; the web app's bundler
consumes the `.ts` directly, matching the upstream monorepo convention for
internal packages). They typecheck under strict settings and are unit-tested.

```bash
npm install        # links the workspaces, installs typescript + vitest
npm run typecheck  # tsc --noEmit across both packages
npm test           # vitest (47 tests)
```

### Why a temporary root

The upstream interface is a monorepo (`apps/web`, shared `packages/*`, turbo +
yarn workspaces). When it is forked in, its root config supersedes this one and
our `packages/spry-*` slot alongside the upstream `packages/`. This root
`package.json` / `tsconfig.base.json` exist only so the Spry packages build and
test in isolation today; they are bootstrap scaffolding to be reconciled with
the upstream root at that point.

## Upstream v4 vs Spry-specific (the reviewability contract)

To keep the diff against `Uniswap/interface` (`apps/web`) auditable, Spry code
is isolated from upstream code:

- **Spry-specific (new):** the `packages/spry-*` packages here, plus a small set
  of Spry widgets and the swap-submit rewrite that will live in `apps/web` once
  forked. These are additive and clearly namespaced.
- **Upstream v4 (kept, lightly rewired):** swap, positions/LP, portfolio, and
  ERC-20 token infrastructure (token lists, selector, balances, allowances +
  Permit2, token safety, token detail pages), and the pools explore list.
- **Removed:** limit orders, fiat buy/sell, NFT marketplace (v4 LP position NFTs
  stay), v2/v3 and migration, governance/bridge/send, broad token explore, and
  the entire trade-options / routing / UniswapX surface. Spry has a single fixed
  execution path: `SpryRouter` -> `PoolManager.unlock` -> `SpryHook`.

A per-area mapping of what changes will be maintained here as `apps/web` lands.

## The packages

- [`@spry/fee`](packages/spry-fee/README.md) - the tier table, the cached
  on-chain `tierParams`, and a faithful JS four-zone fee curve. For charts and
  client-side preview only; execution pricing always uses the `V4Quoter`.
- [`@spry/config`](packages/spry-config/README.md) - per-chain canonical V4 and
  Spry addresses, the subgraph endpoint, the block window, and the Spry-pool
  predicate. Pre-deployment: `SpryHook` / `SpryRouter` / `Quoter` / `subgraphUrl`
  are placeholders the deployer fills.
- [`@spry/slippage`](packages/spry-slippage/README.md) - the reworked
  max-slippage (brief section 7): `amountOutMin` / `amountInMax` that cover both
  price slippage and the dynamic fee rising toward the tier cap within a window.
- [`@spry/sdk`](packages/spry-sdk/README.md) - `SpryRouter` swap calldata
  builders (8 entry points + multicall/Permit2, with the section 6.1 guards) and
  a cached `SpryHook` views client (`BLOCK_WINDOW`, `poolWindow`, `tierParams`).
  Built on viem; ABIs vendored verbatim from `spry-contracts/abis`.

## Sibling repositories

This app integrates with three repos checked out alongside it under `../`:

- `spry-contracts` - `SpryHook`, `SpryRouter`, and the fee libraries; ABIs under
  `abis/`. The `@spry/fee` tier params are transcribed verbatim from
  `SpryHook.sol`, and `@spry/config` addresses are sourced from the subgraph's
  `networks.json`. Pre-deployment: no real `SpryHook` / `SpryRouter` addresses
  yet (CREATE2-mined at deploy).
- `spry-subgraph` - the Spry fork of Uniswap's v4-subgraph. Every indexed pool
  is a Spry pool, so subgraph-fed views need no hook filtering. The deployed
  schema is the source of truth for GraphQL field names.
- `token-list` - the ERC-20 token list the app will use.

## Key invariants the UI relies on

- Fees are V4 pips: `1_000_000` pips = 100%. Never render the `0x800000`
  dynamic-fee sentinel as a number.
- No protocol fee on Spry pools: `Swap.fee == lpFee == SpryFee.fee`; output
  amounts are the complete user-facing values.
- The hook is single, immutable, and non-upgradeable: hardcode per chain; read
  `BLOCK_WINDOW` once and cache.
- Execution pricing is the `V4Quoter` only. The JS curve in `@spry/fee` is for
  charts and previews; never price a trade with it.

## Roadmap

Done (all fork-independent core, fully tested): `@spry/fee` (tier table + curve,
bit-exact vs the contract), `@spry/config` (addresses + Spry-pool predicate),
`@spry/slippage` (the reworked slippage / fee-tolerance model, brief section 7),
`@spry/sdk` (SpryRouter calldata builders + cached SpryHook views client).

The section 15 integration plan is written, grounded in the real upstream tree:
[docs/apps-web-integration.md](docs/apps-web-integration.md). Upstream is pinned
at `web/5.148.6` (commit `417e7724`). Note: the current upstream stack is
**bun + nx + Node 22.22.2 + Vite** (not the yarn+turbo the brief assumed), and
`apps/web` imports 12 workspace packages.

Next increments (the fork's install/build needs Node 22.22.2 + bun, so they
happen in an environment that has those):

1. Land the monorepo fork: `apps/web` + its 12 workspace deps + root config + the
   four `@spry/*` packages under `packages/`; `bun install` green; app boots.
2. Prune the removed surfaces (limit/buy/sell, send, NFT marketplace, v2/v3 +
   migration, governance, routing/UniswapX) and their nav entries.
3. Swap-submit rewrite: wire the Quoter, `@spry/slippage`, and `@spry/sdk`
   builders into `useSwapCallback`; remove the routing surface.
4. Tier picker on create/add-liquidity; Spry widgets (section 9).
5. Point the data layer at the Spry subgraph; re-run GraphQL codegen; wire the
   queries.

Visual / styling work is a separate later pass and is intentionally out of scope
for these increments.
