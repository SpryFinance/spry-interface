// @spry/config - per-chain addresses, subgraph endpoints, block window, and
// the Spry-pool predicate.
//
// Everything is pre-deployment. PoolManager / PositionManager / Permit2 are
// real; SpryHook / SpryRouter / Quoter / subgraphUrl are placeholders the
// deployer fills. Guard Spry-specific UI with `isSpryDeployed`.

export * from './constants';
export * from './types';
export * from './chains';
export * from './predicate';

import { SPRY_CHAINS } from './chains';
import type { SpryChainConfig } from './types';

/** Spry config for a chain id, or `undefined` if unsupported. */
export function getSpryConfig(chainId: number): SpryChainConfig | undefined {
  return SPRY_CHAINS[chainId];
}

/** Spry config for a chain id; throws if unsupported. */
export function requireSpryConfig(chainId: number): SpryChainConfig {
  const config = SPRY_CHAINS[chainId];
  if (!config) {
    throw new Error(`unsupported chainId for Spry: ${chainId}`);
  }
  return config;
}

/** `true` iff Spry is configured for this chain id. */
export function isSupportedChain(chainId: number): boolean {
  return chainId in SPRY_CHAINS;
}
