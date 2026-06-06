import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import { PoolTier, TIER_PARAMS } from '@spry/fee';
import { createSpryHookClient, type ReadContractFn } from '../src/index';

const HOOK = getAddress('0x5555555555555555555555555555555555555555');
const POOL_ID = `0x${'ab'.repeat(32)}` as const;

// A fake reader that records call counts and answers from a fixture.
function makeReader(answers: {
  blockWindow?: bigint;
  poolWindow?: readonly [bigint, bigint];
  tierParams?: Record<string, number | bigint>;
}): { read: ReadContractFn; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const read: ReadContractFn = async (req) => {
    calls[req.functionName] = (calls[req.functionName] ?? 0) + 1;
    switch (req.functionName) {
      case 'BLOCK_WINDOW':
        return answers.blockWindow ?? 6n;
      case 'poolWindow':
        return answers.poolWindow ?? [100n, -42n];
      case 'tierParams':
        return answers.tierParams ?? {};
      default:
        throw new Error(`unexpected read: ${req.functionName}`);
    }
  };
  return { read, calls };
}

// Mimic how viem decodes the tierParams struct: int64/int128 -> bigint, int32/uint32 -> number.
function viemLikeTierParams(tier: PoolTier): Record<string, number | bigint> {
  const big = new Set(['aLeft', 'bLeft', 'aRight', 'bRight', 'aLeftExp', 'bLeftExp', 'aRightExp', 'bRightExp']);
  const out: Record<string, number | bigint> = {};
  for (const [k, v] of Object.entries(TIER_PARAMS[tier])) {
    out[k] = big.has(k) ? BigInt(v as number | bigint) : Number(v);
  }
  return out;
}

describe('SpryHookClient', () => {
  it('caches BLOCK_WINDOW (reads it once)', async () => {
    const { read, calls } = makeReader({ blockWindow: 6n });
    const client = createSpryHookClient(read, HOOK);
    expect(await client.getBlockWindow()).toBe(6n);
    await client.getBlockWindow();
    await client.getBlockWindow();
    expect(calls['BLOCK_WINDOW']).toBe(1);
  });

  it('parses poolWindow into windowStart / signedCum', async () => {
    const { read } = makeReader({ poolWindow: [100n, -42n] });
    const client = createSpryHookClient(read, HOOK);
    expect(await client.getPoolWindow(POOL_ID)).toEqual({ windowStart: 100n, signedCum: -42n });
  });

  it('computes the window countdown', async () => {
    const { read } = makeReader({ blockWindow: 6n, poolWindow: [100n, 0n] });
    const client = createSpryHookClient(read, HOOK);

    const active = await client.windowCountdown(POOL_ID, 103n);
    expect(active).toEqual({ windowStart: 100n, blockWindow: 6n, windowEnd: 106n, blocksRemaining: 3n, expired: false });

    const past = await client.windowCountdown(POOL_ID, 110n);
    expect(past.blocksRemaining).toBe(0n);
    expect(past.expired).toBe(true);
  });

  it('returns the cached tier params without a call', () => {
    const { read, calls } = makeReader({});
    const client = createSpryHookClient(read, HOOK);
    expect(client.getTierParams(PoolTier.BLUE_CHIP)).toBe(TIER_PARAMS[PoolTier.BLUE_CHIP]);
    expect(calls['tierParams']).toBeUndefined();
  });

  it('verifies on-chain tier params against the cached table', async () => {
    const good = makeReader({ tierParams: viemLikeTierParams(PoolTier.BLUE_CHIP) });
    expect(await createSpryHookClient(good.read, HOOK).verifyTierParamsOnChain(PoolTier.BLUE_CHIP)).toBe(true);

    const tampered = viemLikeTierParams(PoolTier.BLUE_CHIP);
    tampered['safeFee'] = Number(tampered['safeFee']) + 1;
    const bad = makeReader({ tierParams: tampered });
    expect(await createSpryHookClient(bad.read, HOOK).verifyTierParamsOnChain(PoolTier.BLUE_CHIP)).toBe(false);
  });
});
