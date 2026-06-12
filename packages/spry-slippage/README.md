# @spry/slippage

Dynamic-fee-aware slippage (brief section 7). Depends on `@spry/fee`.

## Why this exists

Upstream slippage only protects against **price** movement between quote and
execution. On Spry the **LP fee itself is dynamic**: within a block window,
other swaps push the pool's cumulative deeper toward danger, raising the fee for
our swap up to the tier cap. So the quoted fee is a lower bound, and protection
must cover **two buffers**:

1. **Price slippage** (as upstream, a user-set percent), and
2. **Fee headroom** (the fee rising from the quoted value `f_now` toward the
   tier cap within the window).

## Fee policy (`f_max`)

The bound is sized against a protection fee `f_max >= f_now`:

| Policy | `f_max` | Trade-off |
|--------|---------|-----------|
| `WORST_CASE` | `capFee` | Never reverts on fee; most output headroom given up. |
| `BOUNDED` (default) | `min(cap, f_now + delta)` | Balances protection vs revert rate. `delta` is a fixed pip amount or a fraction of the remaining headroom to the cap. |
| `AS_QUOTED` | `f_now` | Opt-in, risky: reverts if anyone trades first in the window. |

## API

```ts
import {
  protectExactIn, protectExactOut, protectExactInForTier,
  resolveProtectionFeePips, impliedFeePipsExactIn,
  FeePolicy, DEFAULT_PROTECTION,
} from '@spry/slippage';
import { PoolTier, formatFeePercent } from '@spry/fee';

// 1. Quote through the V4Quoter (authoritative). Derive the current fee:
const feeNowPips = impliedFeePipsExactIn(grossOut, netOut); // (gross - net)/gross

// 2. Size the bound (default = BOUNDED at half the headroom + 0.50% slippage):
const { amountOutMin, feeMaxPips } = protectExactInForTier(PoolTier.BLUE_CHIP, {
  amountOut: netOut,
  feeNowPips,
});

// 3. Show the range in the review (brief section 7.3):
//    `Fee now ${formatFeePercent(feeNowPips)} - protected to ${formatFeePercent(feeMaxPips)} - cap ${formatFeePercent(capFeePips)}`
```

`protectExactOut` / `protectExactOutForTier` return `amountInMax` instead.

## Correctness

- **Exact-in** output scales with the effective input `(1 - f)`. The estimate
  `out * (1 - f_max)/(1 - f_now)` is a **conservative lower bound** on the true
  output at `f_max` (constant-product output is concave in input), so
  `amountOutMin` never over-tightens and cause a spurious revert. It is floored.
- **Exact-out** input is `baseIn / (1 - f)` and `baseIn` is independent of the
  fee, so `in * (1 - f_now)/(1 - f_max)` is **exact**. The bound is ceiled.

Sizing/preview only: the swap executes through the router, and the live price
and fee come from the `V4Quoter`.

## Test

```bash
cd packages/spry-slippage && bunx vitest run
```
