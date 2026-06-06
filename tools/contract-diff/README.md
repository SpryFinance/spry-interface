# contract-diff harness

Generates the differential-test fixture that proves `@spry/fee`'s JavaScript
port matches the real on-chain Solidity. This is a **read-only** tool: it
compiles against the contract sources in the sibling `spry-contracts` checkout
(using that repo's already-vendored libs) and writes a CSV into this repo. It
never modifies `spry-contracts`.

## What it does

`script/DumpFees.s.sol` is a `forge` script that runs in an in-memory EVM,
instantiates the real `SpryHook`, and evaluates `SmartFeeLib.feeForDelta`,
`marginalFee`, `zoneOf`, `dispatchCase`, and `SpryHook.tierParams` over a grid.
It writes `packages/spry-fee/test/fixtures/contract-fees.csv`, which
`packages/spry-fee/test/contract-diff.test.ts` then diffs the JS port against.

## Requirements

- Foundry (`forge`).
- The `spry-contracts` checkout at `../spry-contracts` relative to
  `spry-interface` (the default sibling layout). Remappings in `foundry.toml`
  point at `../../../spry-contracts/...`.

## Regenerate the fixture

From the `spry-interface` root:

```bash
forge script tools/contract-diff/script/DumpFees.s.sol --root tools/contract-diff
```

Then run the differential test:

```bash
npm test --workspace @spry/fee
```

The committed CSV fixture is the source of truth for the test, so day-to-day
`npm test` and CI never need Foundry. Regenerate only if `spry-contracts`
changes (the hook is immutable, so in practice this is a one-time artifact).
