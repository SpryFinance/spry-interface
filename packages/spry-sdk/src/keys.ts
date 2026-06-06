// PoolKey helpers: building a Spry PoolKey and computing the v4 PoolId.

import { encodeAbiParameters, keccak256 } from 'viem';
import { DYNAMIC_FEE_FLAG, tickSpacingForTier, type PoolTier } from '@spry/fee';
import type { Address, Hex, PoolKey } from './types';

const POOL_KEY_PARAMS = [
  {
    type: 'tuple',
    components: [
      { name: 'currency0', type: 'address' },
      { name: 'currency1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickSpacing', type: 'int24' },
      { name: 'hooks', type: 'address' },
    ],
  },
] as const;

/**
 * The v4 PoolId: `keccak256(abi.encode(poolKey))`. Matches `PoolIdLibrary.toId`
 * (the five 32-byte words of the struct). This is the `bytes32` id used by
 * `poolWindow`, the subgraph `Pool.id`, and the `SpryFee` event.
 */
export function poolId(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters(POOL_KEY_PARAMS, [key]));
}

/** Sort two currencies into v4 order (`currency0 < currency1`); native ETH (0x0) sorts first. */
export function sortCurrencies(a: Address, b: Address): [Address, Address] {
  return BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
}

/**
 * Build a Spry `PoolKey` for a tier: `fee = DYNAMIC_FEE_FLAG`, `tickSpacing`
 * from the tier, currencies sorted into v4 order, and the given hook.
 */
export function spryPoolKey(args: {
  tokenA: Address;
  tokenB: Address;
  tier: PoolTier;
  hookAddress: Address;
}): PoolKey {
  const [currency0, currency1] = sortCurrencies(args.tokenA, args.tokenB);
  return {
    currency0,
    currency1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: tickSpacingForTier(args.tier),
    hooks: args.hookAddress,
  };
}
