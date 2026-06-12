# Contributing to the Spry interface

Thanks for your interest in Spry! This repository is the Spry web app: a fork
of the Uniswap v4 web interface (`Uniswap/interface`, pinned at `web/5.148.6`)
maintained by SpryFinance. It currently runs on **Base Sepolia** and is
**pre-audit / pre-mainnet**.

## Getting set up

```bash
nvm install 22.22.2 && nvm use 22.22.2   # the preinstall check enforces the exact version
bun install
bun web dev                               # http://localhost:3000
```

See the [README](README.md) for the full architecture, environment variables,
and deployment notes.

## Before you open a PR

Run the quality gates on what you touched:

```bash
bunx oxlint -c oxlint.config.ts <files>        # lint (oxc, not eslint)
bunx oxfmt <files>                             # format (oxc, not prettier)
bunx tsgo --noEmit -p apps/web/tsconfig.json   # typecheck the app
bunx tsgo --noEmit -p packages/uniswap/tsconfig.json
cd apps/web && bunx vitest run <related test files>
```

All four should be clean (the only allowed failures are ones you can show are
pre-existing on `main`).

## House rules for changes

This fork has one overriding design goal: **the diff against upstream
`Uniswap/interface` stays small and auditable.** Practically:

- **New Spry behavior goes in Spry-namespaced code**: the `packages/spry-*`
  workspaces, `apps/web/src/features/Liquidity/spry/`, the `spryLocal*` rail
  modules. Prefer adding a seam over rewriting an upstream function.
- **Edits inside upstream files carry a `SPRY:` comment** explaining what
  changed and why.
- **Testnet-only gates carry a `RESTORE FOR MAINNET` note** with the original
  upstream code kept inline (commented), so the mainnet pass is a grep, not an
  archaeology dig.
- **Don't delete upstream code you could strand instead** when a type-level
  member is required by exhaustive maps (see the SVM / bridging precedents).
- Local rails must **never price a trade or position from the JS fee curve or
  the subgraph**: execution amounts come from the `V4Quoter` and live
  `StateView` reads (see "Key invariants" in the README).

## Reporting bugs

Open a GitHub issue on this repository with:

- What you did, what you expected, and what happened (screenshots help)
- The page/flow (swap, positions list, create position, add/remove/collect)
- Browser + viewport (desktop / tablet / mobile), and the wallet you used
- The chain (Base Sepolia today) and, for failed transactions, the tx hash or
  the exact error text from the review modal

For protocol-level issues (the hook, the fee curve, the router), file against
[`spry-contracts`](https://github.com/SpryFinance/spry-contracts) instead. For
indexing issues (missing pools/positions, wrong fee history), file against
[`spry-subgraph`](https://github.com/SpryFinance/spry-subgraph).

## Security

Please do **not** open public issues for security-sensitive findings (anything
that could affect funds once deployed beyond testnet). Reach out to the
maintainers privately first.
