# Landing the apps/web fork

How to bring the upstream Uniswap `apps/web` into this repo on top of the Spry
foundation packages. This must run in an environment with the upstream
toolchain, which the current dev box does not have:

- **Node exactly `22.22.2`** (`.nvmrc`; the upstream `preinstall` hard-checks it).
- **bun `>= 1.3.11`**. npm is blocked upstream (`"npm": "please-use-bun"`).

Pinned upstream: `Uniswap/interface` tag `web/5.148.6` (commit `417e7724`).

## Quick start

```bash
# from the spry-interface repo root, clean working tree:
nvm install 22.22.2 && nvm use     # match .nvmrc
curl -fsSL https://bun.sh/install | bash   # if bun is not installed
./scripts/land-fork.sh             # clones upstream, brings it in, bun install, prepare
bun web dev                        # boot the dev server
```

`scripts/land-fork.sh` works on a fresh branch and leaves everything staged but
uncommitted for review. It is a scaffold: review the staged diff and expect to
iterate (see the checklist below).

## What the script does (and the manual equivalent)

1. `git switch -c fork/apps-web-web-5.148.6`.
2. Shallow-clone upstream at the pin into a temp dir.
3. `rsync` the upstream tree in, **dropping** `apps/mobile`, `apps/extension`,
   `labs/`, and keeping our `README.md`, `packages/spry-*`, `tools/contract-diff`,
   and `docs/` (these do not exist upstream, so they survive the merge).
4. Remove the npm bootstrap: `package-lock.json`, root `vitest.config.ts`
   (upstream's root `package.json` + `tsconfig.base.json` replace ours).
5. `bun install`. If a native postinstall fails (e.g. `hashcash-native`), retry
   `bun install --ignore-scripts`, then run step 6 manually.
6. `bun web prepare` (graphql codegen and other prep).

The result: `spry-interface` is the bun + nx monorepo fork, with `apps/web`, the
workspace packages, and our four `@spry/*` packages under `packages/`.

## Verify

```bash
bun web dev          # dev server boots
bun web typecheck    # nx typecheck web
bun web test         # nx test web
```

## Reconciliation checklist

After install, before relying on the build, confirm:

- [ ] The four `@spry/*` packages are picked up by the `packages/*` workspace
      glob (they are, by name). Run `bun install` and check they symlink.
- [ ] `@spry/*` `tsconfig.json` files extend `../../tsconfig.base.json`, which is
      now **upstream's** base. Verify they still typecheck; if upstream's base
      differs, point them at the right base (or `config/tsconfig`).
- [ ] nx sees the `@spry/*` packages. If `nx test @spry/fee` / `nx typecheck`
      do not resolve, add a minimal `project.json` to each (or rely on package
      manifest inference), wiring their existing `test` / `typecheck` scripts.
- [ ] The Spry packages' tests still run under the upstream vitest setup
      (they can adopt `config/vitest-presets`).
- [ ] Root `README.md` is the Spry one (the script keeps it); upstream's README
      is in the clone if you want to reference it.

## Optional: minimize the package set

The script keeps all upstream `packages/*` for guaranteed resolution. Once the
app builds, you can trim to `apps/web`'s actual workspace closure to shrink the
tree and drop native/mobile-only packages.

**`apps/web` needs (its closure):** `packages/{api, chains, config, cryptography,
encoding, environment, gating, notifications, prices, sessions, websocket, ui,
uniswap, utilities}` plus `config/vitest-presets`. Keep `config/*` and
`tools/uniswap-nx` for tooling.

**Safe to drop (not in the closure):** `packages/{analytics, config-cli,
datadog-cloud, hashcash-native, logger, mycelium, privacy, react-query, trpc,
wallet}`. Drop one at a time and re-run `bun web typecheck` to confirm, since a
package can be reached via a source import not declared in `package.json`.

## Then: prune the Spry surfaces

With the app booting, prune the removed routes/features and rewire swap per the
keep / rewire / remove mapping in
[apps-web-integration.md](apps-web-integration.md).
