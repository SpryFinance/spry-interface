import type { Address } from './constants';

/** Contract addresses for one chain. */
export interface SpryAddresses {
  /** Canonical V4 core singleton. Source of all pool events. */
  poolManager: Address;
  /** Canonical V4 periphery. ERC-721 LP positions (all liquidity goes here). */
  positionManager: Address;
  /** Canonical V4Quoter. The ONLY authoritative source for execution pricing. */
  quoter: Address;
  /** Canonical Permit2 (universal address). */
  permit2: Address;
  /** SpryHook. Pre-deployment placeholder until the hook is deployed + mined. */
  spryHook: Address;
  /** SpryRouter. Pre-deployment placeholder. Every swap routes through it. */
  spryRouter: Address;
}

/** Full Spry configuration for one chain. */
export interface SpryChainConfig {
  /** EIP-155 chain id. */
  chainId: number;
  /** Slug matching the Spry subgraph's `networks.json` key. */
  key: string;
  /** Human-readable network name. */
  name: string;
  /** Whether this is a testnet. */
  testnet: boolean;
  addresses: SpryAddresses;
  /**
   * Block from which indexers / the hook start. Provisional: it currently
   * mirrors the canonical V4 deploy block from the subgraph's `networks.json`
   * and will be replaced by the real hook deploy block at deployment.
   */
  startBlock: number;
  /**
   * Recommended `BLOCK_WINDOW` for this chain (informational only). The
   * authoritative value is the per-chain `immutable` set at deployment: read
   * `SpryHook.BLOCK_WINDOW()` once on-chain and cache it. `null` where we have
   * no recommendation.
   */
  blockWindowHint: number | null;
  /** Spry subgraph endpoint. `null` until chosen at deploy (The Graph / Goldsky). */
  subgraphUrl: string | null;
}
