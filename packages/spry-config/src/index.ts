// @spry/config - per-chain addresses, subgraph endpoints, block window, RPCs,
// and the Spry-pool predicate.
//
// Spry is LIVE on Unichain Sepolia and Base Sepolia (contracts deployed +
// verified, subgraph serving); Sepolia is pre-deployment. Guard Spry-specific
// UI / rails per chain with `isSpryChain` (or `isSpryDeployed` on a config).

export * from './constants';
export * from './types';
export * from './chains';
export * from './predicate';

import { SPRY_CHAINS } from './chains';
import { isSpryDeployed } from './predicate';
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

/**
 * `true` iff Spry is configured AND deployed on this chain id (hook + router
 * real). The single check the rails / UI gate on to decide "is this a Spry
 * chain we serve". Both live testnets pass; Sepolia (placeholder) does not.
 */
export function isSpryChain(chainId: number): boolean {
  const config = SPRY_CHAINS[chainId];
  return config !== undefined && isSpryDeployed(config);
}

/** The public JSON-RPC endpoint for a Spry chain, or `undefined` if unsupported. */
export function getSpryRpcUrl(chainId: number): string | undefined {
  return SPRY_CHAINS[chainId]?.rpcUrl;
}
