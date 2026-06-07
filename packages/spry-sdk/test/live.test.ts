import { describe, it, expect } from 'vitest';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { ChainId, requireSpryConfig } from '@spry/config';
import { PoolTier } from '@spry/fee';
import { createSpryHookClient, spryHookAbi, type ReadContractFn } from '../src/index';

// Live deployment sanity check against the real Base Sepolia SpryHook.
// Skipped unless SPRY_LIVE_RPC is set to a Base Sepolia RPC URL, so the default
// test run stays deterministic and offline.
//   SPRY_LIVE_RPC=https://sepolia.base.org npx vitest run packages/spry-sdk/test/live.test.ts
const RPC = process.env['SPRY_LIVE_RPC'];

describe.skipIf(!RPC)('live Base Sepolia deployment', () => {
  const config = requireSpryConfig(ChainId.BASE_SEPOLIA);
  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const read: ReadContractFn = (req) => client.readContract(req as never) as Promise<unknown>;
  const hook = createSpryHookClient(read, config.addresses.spryHook);

  it('reads BLOCK_WINDOW (> 0)', async () => {
    const bw = await hook.getBlockWindow();
    // eslint-disable-next-line no-console
    console.log('base-sepolia BLOCK_WINDOW =', bw.toString());
    expect(bw).toBeGreaterThan(0n);
  });

  it('POOL_MANAGER matches config', async () => {
    const pm = (await client.readContract({
      address: config.addresses.spryHook,
      abi: spryHookAbi,
      functionName: 'POOL_MANAGER',
    })) as string;
    expect(pm.toLowerCase()).toBe(config.addresses.poolManager.toLowerCase());
  });

  it('canonical Quoter and StateView are deployed', async () => {
    for (const address of [config.addresses.quoter, config.addresses.stateView]) {
      const code = await client.getBytecode({ address });
      expect((code?.length ?? 0) > 2).toBe(true);
    }
  });

  it('TIER_COUNT is 5 and permissionsFlags is BEFORE_SWAP_FLAG (128)', async () => {
    const tierCount = await client.readContract({
      address: config.addresses.spryHook,
      abi: spryHookAbi,
      functionName: 'TIER_COUNT',
    });
    expect(Number(tierCount)).toBe(5);
    const flags = await client.readContract({
      address: config.addresses.spryHook,
      abi: spryHookAbi,
      functionName: 'permissionsFlags',
    });
    expect(flags).toBe(128n); // Hooks.BEFORE_SWAP_FLAG = 1 << 7
  });

  it('cached @spry/fee tierParams match the live contract for all tiers', async () => {
    for (const tier of Object.values(PoolTier)) {
      expect(await hook.verifyTierParamsOnChain(tier), tier).toBe(true);
    }
  });
});
