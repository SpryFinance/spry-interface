import { describe, it, expect } from 'vitest';
import { createPublicClient, decodeFunctionData, getAddress, http, type Chain } from 'viem';
import { baseSepolia, unichainSepolia } from 'viem/chains';
import { ChainId, requireSpryConfig, SPRY_DEPLOYED_CHAIN_IDS } from '@spry/config';
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

// Full live end-to-end against each Spry deployment, exercising every package:
// subgraph (discover pool) -> reconstruct + verify poolId -> StateView
// (cross-check) -> V4Quoter (price) -> @spry/fee (gross / implied fee) ->
// @spry/slippage (bounds) -> @spry/sdk (calldata). Runs by default, reading
// each chain's RPC from @spry/config (override with SPRY_<CHAIN>_RPC).
const VIEM_CHAIN_BY_ID: Record<number, Chain> = {
  [ChainId.UNICHAIN_SEPOLIA]: unichainSepolia,
  [ChainId.BASE_SEPOLIA]: baseSepolia,
};
const RPC_ENV_BY_ID: Record<number, string> = {
  [ChainId.UNICHAIN_SEPOLIA]: 'SPRY_UNICHAIN_SEPOLIA_RPC',
  [ChainId.BASE_SEPOLIA]: 'SPRY_BASE_SEPOLIA_RPC',
};
const log = (...args: unknown[]) => console.log(...args); // eslint-disable-line no-console

describe.each(SPRY_DEPLOYED_CHAIN_IDS)('live end-to-end swap pricing (chain %s)', (chainId) => {
  const config = requireSpryConfig(chainId);
  const rpc = process.env[RPC_ENV_BY_ID[chainId] ?? ''] ?? config.rpcUrl;
  const client = createPublicClient({ chain: VIEM_CHAIN_BY_ID[chainId], transport: http(rpc) });
  const read: StateViewReadFn = (req) => client.readContract(req as never) as Promise<unknown>;
  const simulate: SimulateQuoteFn = async (req) =>
    (await client.simulateContract(req as never)).result as readonly [bigint, bigint];

  const graph = createSpryGraphClientForChain(chainId);
  const stateView = createSpryStateViewClient(read, config.addresses.stateView);
  const quoter = createSpryQuoterClient(simulate, config.addresses.quoter);

  it('discovers a pool, verifies its id, prices a swap, and builds the calldata', async () => {
    // 1. Discover a Spry pool from the subgraph. A chain with no pools seeded yet
    //    has nothing to price end-to-end, so skip with a note (the unit suites
    //    cover the calldata/pricing math without a live pool).
    const pools = await fetchPools(graph, { first: 1 });
    if (pools.length === 0) {
      log(`[${config.key}] no Spry pools indexed yet; skipping live e2e`);
      return;
    }
    const pool = pools[0]!;
    log(`[${config.key}] pool ${pool.id}  ${pool.token0.symbol}/${pool.token1.symbol}  tier=${pool.tier}`);

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
    log(`[${config.key}] reserves=(${reserves.reserve0}, ${reserves.reserve1})`);

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
    log(`[${config.key}] net=${net}  gross=${gross}  impliedFee=${feePipsToPercent(feeNowPips)}% (${feeNowPips} pips)`);

    // 6. Size the bound (price slippage + fee headroom toward the tier cap).
    const { amountOutMin, feeMaxPips } = protectExactInForTier(pool.tier, { amountOut: net, feeNowPips });
    expect(amountOutMin).toBeGreaterThan(0n);
    expect(amountOutMin).toBeLessThanOrEqual(net);
    log(`[${config.key}] amountOutMin=${amountOutMin}  protectedToFee=${feePipsToPercent(feeMaxPips)}%`);

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
