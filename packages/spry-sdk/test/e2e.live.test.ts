import { describe, it, expect } from 'vitest';
import { createPublicClient, decodeFunctionData, getAddress, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { ChainId, requireSpryConfig } from '@spry/config';
import { feePipsToPercent } from '@spry/fee';
import { createSpryGraphClientForChain, fetchPools } from '@spry/subgraph';
import { impliedFeePipsExactIn, protectExactInForTier } from '@spry/slippage';
import {
  spryRouterAbi,
  spryPoolKey,
  poolId,
  createSpryStateViewClient,
  createSpryQuoterClient,
  buildSwapExactInputSingle,
  type StateViewReadFn,
  type SimulateQuoteFn,
} from '../src/index';

// Full live end-to-end against the Base Sepolia deployment, exercising every
// package: subgraph (discover pool) -> reconstruct + verify poolId -> StateView
// (cross-check) -> V4Quoter (price) -> @spry/fee (gross / implied fee) ->
// @spry/slippage (bounds) -> @spry/sdk (calldata). Skipped unless SPRY_LIVE_RPC
// is set.
//   SPRY_LIVE_RPC=https://sepolia.base.org npx vitest run packages/spry-sdk/test/e2e.live.test.ts
const RPC = process.env.SPRY_LIVE_RPC;
const log = (...args: unknown[]) => console.log(...args); // eslint-disable-line no-console

describe.skipIf(!RPC)('live end-to-end swap pricing (Base Sepolia)', () => {
  const config = requireSpryConfig(ChainId.BASE_SEPOLIA);
  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const read: StateViewReadFn = (req) => client.readContract(req as never) as Promise<unknown>;
  const simulate: SimulateQuoteFn = async (req) =>
    (await client.simulateContract(req as never)).result as readonly [bigint, bigint];

  const graph = createSpryGraphClientForChain(ChainId.BASE_SEPOLIA);
  const stateView = createSpryStateViewClient(read, config.addresses.stateView);
  const quoter = createSpryQuoterClient(simulate, config.addresses.quoter);

  it('discovers a pool, verifies its id, prices a swap, and builds the calldata', async () => {
    // 1. Discover a Spry pool from the subgraph.
    const pools = await fetchPools(graph, { first: 1 });
    expect(pools.length).toBeGreaterThan(0);
    const pool = pools[0]!;
    log(`pool ${pool.id}  ${pool.token0.symbol}/${pool.token1.symbol}  tier=${pool.tier}`);

    // 2. Reconstruct the PoolKey and confirm poolId() matches the subgraph id.
    const key = spryPoolKey({
      tokenA: getAddress(pool.token0.id),
      tokenB: getAddress(pool.token1.id),
      tier: pool.tier,
      hookAddress: config.addresses.spryHook,
    });
    const id = poolId(key);
    expect(id.toLowerCase()).toBe(pool.id.toLowerCase());

    // 3. Read pool state on-chain via StateView -> virtual reserves.
    const reserves = await stateView.getVirtualReserves(id);
    expect(reserves.reserve0).toBeGreaterThan(0n);
    expect(reserves.reserve1).toBeGreaterThan(0n);
    log(`reserves=(${reserves.reserve0}, ${reserves.reserve1})`);

    // 4. Price an exact-input swap via the Quoter (authoritative net output).
    const amountIn = 10n ** 18n;
    const zeroForOne = true;
    const { amountOut: net } = await quoter.quoteExactInputSingle({ poolKey: key, zeroForOne, exactAmount: amountIn });
    expect(net).toBeGreaterThan(0n);
    expect(net).toBeLessThan(amountIn); // some fee + price impact

    // 5. Implied current fee = (gross - net) / gross, gross = zero-fee CP output.
    const gross = (reserves.reserve1 * amountIn) / (reserves.reserve0 + amountIn);
    expect(gross).toBeGreaterThan(net);
    const feeNowPips = impliedFeePipsExactIn(gross, net);
    expect(feeNowPips).toBeGreaterThan(0);
    expect(feeNowPips).toBeLessThan(Number(pool.capFeePips));
    log(`net=${net}  gross=${gross}  impliedFee=${feePipsToPercent(feeNowPips)}% (${feeNowPips} pips)`);

    // 6. Size the bound (price slippage + fee headroom toward the tier cap).
    const { amountOutMin, feeMaxPips } = protectExactInForTier(pool.tier, { amountOut: net, feeNowPips });
    expect(amountOutMin).toBeGreaterThan(0n);
    expect(amountOutMin).toBeLessThanOrEqual(net);
    log(`amountOutMin=${amountOutMin}  protectedToFee=${feePipsToPercent(feeMaxPips)}%`);

    // 7. Build the SpryRouter calldata.
    const tx = buildSwapExactInputSingle({
      router: config.addresses.spryRouter,
      key,
      zeroForOne,
      amountIn,
      amountOutMin,
      recipient: getAddress('0x1111111111111111111111111111111111111111'),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
    });
    expect(tx.to).toBe(config.addresses.spryRouter);
    expect(tx.value).toBe(0n); // ERC-20 input
    expect(decodeFunctionData({ abi: spryRouterAbi, data: tx.data }).functionName).toBe('swapExactInputSingle');
  });
});
