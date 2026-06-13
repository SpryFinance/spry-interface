import { describe, it, expect } from 'vitest';
import { createPublicClient, http, type Chain } from 'viem';
import { baseSepolia, unichainSepolia } from 'viem/chains';
import { ChainId, requireSpryConfig, SPRY_DEPLOYED_CHAIN_IDS } from '@spry/config';
import { PoolTier } from '@spry/fee';
import { createSpryHookClient, spryHookAbi, type ReadContractFn } from '../src/index';

// Live deployment sanity check against the real SpryHook on every Spry-deployed
// chain (Unichain Sepolia, Base Sepolia). Runs by default, reading each chain's
// RPC from @spry/config; override a chain's RPC with its env var if the public
// endpoint is rate-limited:
//   SPRY_UNICHAIN_SEPOLIA_RPC=https://sepolia.unichain.org
//   SPRY_BASE_SEPOLIA_RPC=https://sepolia.base.org
const VIEM_CHAIN_BY_ID: Record<number, Chain> = {
  [ChainId.UNICHAIN_SEPOLIA]: unichainSepolia,
  [ChainId.BASE_SEPOLIA]: baseSepolia,
};
const RPC_ENV_BY_ID: Record<number, string> = {
  [ChainId.UNICHAIN_SEPOLIA]: 'SPRY_UNICHAIN_SEPOLIA_RPC',
  [ChainId.BASE_SEPOLIA]: 'SPRY_BASE_SEPOLIA_RPC',
};

describe.each(SPRY_DEPLOYED_CHAIN_IDS)('live Spry deployment (chain %s)', (chainId) => {
  const config = requireSpryConfig(chainId);
  const rpc = process.env[RPC_ENV_BY_ID[chainId] ?? ''] ?? config.rpcUrl;
  const client = createPublicClient({ chain: VIEM_CHAIN_BY_ID[chainId], transport: http(rpc) });
  const read: ReadContractFn = (req) => client.readContract(req as never) as Promise<unknown>;
  const hook = createSpryHookClient(read, config.addresses.spryHook);

  it('reads BLOCK_WINDOW (> 0)', async () => {
    const bw = await hook.getBlockWindow();
    // eslint-disable-next-line no-console
    console.log(`${config.key} BLOCK_WINDOW =`, bw.toString());
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
