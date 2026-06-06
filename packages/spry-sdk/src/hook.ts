// SpryHook views client with boot-time caching.
//
// BLOCK_WINDOW and the tier params are immutable, so they are read once and
// cached. poolWindow is live (the pool's current block-windowed cumulative),
// driving the fee-curve live marker and the window countdown.

import { TIERS, TIER_PARAMS, type PoolTier, type SpryFeeParams } from '@spry/fee';
import { spryHookAbi } from './abi';
import type { Address, Hex } from './types';

/**
 * A minimal `readContract` abstraction: a thin adapter around viem's
 * `PublicClient.readContract` (or wagmi). Injected so the client is testable
 * without a live chain.
 */
export interface ReadContractFn {
  (request: {
    address: Address;
    abi: typeof spryHookAbi;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
}

/** A pool's current block-windowed cumulative state. */
export interface PoolWindowState {
  windowStart: bigint;
  signedCum: bigint;
}

/** Window countdown for the "fees relax if no one trades" widget. */
export interface WindowCountdown {
  windowStart: bigint;
  blockWindow: bigint;
  windowEnd: bigint;
  blocksRemaining: bigint;
  expired: boolean;
}

export interface SpryHookClient {
  hookAddress: Address;
  /** Read BLOCK_WINDOW once and cache it (immutable per chain). */
  getBlockWindow(): Promise<bigint>;
  /** Live read of the pool's current cumulative-window state. */
  getPoolWindow(poolId: Hex): Promise<PoolWindowState>;
  /** windowStart + BLOCK_WINDOW - currentBlock, clamped at zero. */
  windowCountdown(poolId: Hex, currentBlock: bigint): Promise<WindowCountdown>;
  /** The tier's params from the cached (bit-exact) table; no on-chain call. */
  getTierParams(tier: PoolTier): SpryFeeParams;
  /** Read tierParams on-chain and confirm it matches the cached table. */
  verifyTierParamsOnChain(tier: PoolTier): Promise<boolean>;
}

const PARAM_FIELDS = [
  'safeLow',
  'safeHigh',
  'alertLow',
  'alertHigh',
  'dangerLow',
  'dangerHigh',
  'aLeft',
  'bLeft',
  'aRight',
  'bRight',
  'aLeftExp',
  'bLeftExp',
  'aRightExp',
  'bRightExp',
  'safeFee',
  'capFee',
] as const satisfies readonly (keyof SpryFeeParams)[];

export function createSpryHookClient(readContract: ReadContractFn, hookAddress: Address): SpryHookClient {
  let cachedBlockWindow: bigint | undefined;

  async function getBlockWindow(): Promise<bigint> {
    if (cachedBlockWindow === undefined) {
      cachedBlockWindow = (await readContract({
        address: hookAddress,
        abi: spryHookAbi,
        functionName: 'BLOCK_WINDOW',
      })) as bigint;
    }
    return cachedBlockWindow;
  }

  async function getPoolWindow(poolId: Hex): Promise<PoolWindowState> {
    const res = (await readContract({
      address: hookAddress,
      abi: spryHookAbi,
      functionName: 'poolWindow',
      args: [poolId],
    })) as readonly [bigint, bigint];
    return { windowStart: res[0], signedCum: res[1] };
  }

  async function windowCountdown(poolId: Hex, currentBlock: bigint): Promise<WindowCountdown> {
    const [blockWindow, state] = await Promise.all([getBlockWindow(), getPoolWindow(poolId)]);
    const windowEnd = state.windowStart + blockWindow;
    const blocksRemaining = windowEnd > currentBlock ? windowEnd - currentBlock : 0n;
    return { windowStart: state.windowStart, blockWindow, windowEnd, blocksRemaining, expired: blocksRemaining === 0n };
  }

  function getTierParams(tier: PoolTier): SpryFeeParams {
    return TIER_PARAMS[tier];
  }

  async function verifyTierParamsOnChain(tier: PoolTier): Promise<boolean> {
    const raw = (await readContract({
      address: hookAddress,
      abi: spryHookAbi,
      functionName: 'tierParams',
      args: [TIERS[tier].index],
    })) as Record<string, number | bigint>;
    const cached = TIER_PARAMS[tier];
    // viem returns int64/int128 as bigint and int32/uint32 as number; coerce both sides.
    return PARAM_FIELDS.every((field) => BigInt(raw[field] as number | bigint) === BigInt(cached[field]));
  }

  return { hookAddress, getBlockWindow, getPoolWindow, windowCountdown, getTierParams, verifyTierParamsOnChain };
}
