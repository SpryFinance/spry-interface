// The Spry-pool predicate (brief section 2).
//
// A v4 pool is a Spry pool IFF all three hold:
//   key.hooks       == SPRY_HOOK_ADDRESS (for the chain)
//   key.fee         == DYNAMIC_FEE_FLAG (0x800000)
//   key.tickSpacing in {1, 10, 60, 200, 1000}
//
// Apply this on every NON-subgraph pool path (deep links, manual entry, a
// freshly created pool, any raw on-chain PoolKey). Subgraph-fed views need NO
// such check: the Spry subgraph indexes only pools on SpryHook, so every pool
// it returns is already Spry.

import { DYNAMIC_FEE_FLAG, isValidTickSpacing } from '@spry/fee';
import { isPlaceholder, sameAddress } from './constants';
import type { SpryChainConfig } from './types';

/** The subset of a v4 `PoolKey` the predicate inspects. */
export interface PoolKeyLike {
  hooks: string;
  /** The raw `fee` field (the dynamic-fee sentinel for Spry pools). */
  fee: number | bigint;
  tickSpacing: number;
}

/** Why a `PoolKey` is not a Spry pool, or `null` if it is. */
export type SpryPoolRejection = 'wrong-hook' | 'not-dynamic-fee' | 'invalid-tick-spacing' | null;

/**
 * Classify a `PoolKey` against the Spry predicate for a chain. Returns `null`
 * when the key IS a Spry pool, otherwise the first failing reason.
 */
export function classifySpryPoolKey(key: PoolKeyLike, config: SpryChainConfig): SpryPoolRejection {
  if (!sameAddress(key.hooks, config.addresses.spryHook)) return 'wrong-hook';
  if (Number(key.fee) !== DYNAMIC_FEE_FLAG) return 'not-dynamic-fee';
  if (!isValidTickSpacing(key.tickSpacing)) return 'invalid-tick-spacing';
  return null;
}

/** `true` iff `key` is a Spry pool on `config`'s chain (brief section 2). */
export function isSpryPoolKey(key: PoolKeyLike, config: SpryChainConfig): boolean {
  return classifySpryPoolKey(key, config) === null;
}

/** Throw if `key` is not a Spry pool, with the specific reason. */
export function assertSpryPoolKey(key: PoolKeyLike, config: SpryChainConfig): void {
  const reason = classifySpryPoolKey(key, config);
  if (reason !== null) {
    throw new Error(`not a Spry pool on ${config.name}: ${reason}`);
  }
}

/**
 * `true` once the Spry contracts are actually deployed on this chain (i.e. the
 * hook + router are no longer placeholders). Use it to gate Spry-specific UI
 * before deployment.
 */
export function isSpryDeployed(config: SpryChainConfig): boolean {
  return !isPlaceholder(config.addresses.spryHook) && !isPlaceholder(config.addresses.spryRouter);
}

/** Throw if the Spry contracts are not yet deployed on this chain. */
export function assertSpryDeployed(config: SpryChainConfig): void {
  if (!isSpryDeployed(config)) {
    throw new Error(
      `Spry is not deployed on ${config.name} (chainId ${config.chainId}): hook/router addresses are placeholders`,
    );
  }
}
