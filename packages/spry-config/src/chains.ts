// Per-chain Spry configuration.
//
// The three networks here are exactly the ones the Spry subgraph indexes
// (see spry-subgraph/networks.json). Everything is PRE-DEPLOYMENT:
//
//   - poolManager / positionManager: REAL canonical V4 addresses, copied
//     verbatim from the subgraph's networks.json (authoritative in-repo source).
//   - permit2: the universal canonical Permit2 address.
//   - quoter: PLACEHOLDER. Fill from the canonical v4-periphery deployment for
//     each chain (https://docs.uniswap.org/contracts/v4/deployments) before use.
//   - spryHook / spryRouter: PLACEHOLDER until the contracts are deployed
//     (the hook address is CREATE2-mined at deploy; the subgraph uses the same
//     0xffff...ffff sentinel today).
//   - subgraphUrl: null until chosen at deploy (The Graph / Goldsky).
//   - startBlock: provisional (canonical V4 deploy block; replace with the hook
//     deploy block at deployment).
//
// See the "TODO before mainnet/testnet use" section in this package's README.

import { PERMIT2_ADDRESS, PLACEHOLDER_ADDRESS } from './constants';
import type { SpryChainConfig } from './types';

/** EIP-155 chain ids for the supported networks. */
export const ChainId = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  UNICHAIN_SEPOLIA: 1301,
} as const;

export const SEPOLIA: SpryChainConfig = {
  chainId: ChainId.SEPOLIA,
  key: 'sepolia',
  name: 'Sepolia',
  testnet: true,
  addresses: {
    poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
    positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
    quoter: PLACEHOLDER_ADDRESS, // TODO: canonical V4Quoter on Sepolia
    permit2: PERMIT2_ADDRESS,
    spryHook: PLACEHOLDER_ADDRESS, // TODO: deployed SpryHook
    spryRouter: PLACEHOLDER_ADDRESS, // TODO: deployed SpryRouter
  },
  startBlock: 7258946,
  blockWindowHint: 1, // ~12s blocks
  subgraphUrl: null, // TODO: deployed Spry subgraph endpoint
};

export const BASE_SEPOLIA: SpryChainConfig = {
  chainId: ChainId.BASE_SEPOLIA,
  key: 'base-sepolia',
  name: 'Base Sepolia',
  testnet: true,
  addresses: {
    poolManager: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408',
    positionManager: '0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80',
    quoter: PLACEHOLDER_ADDRESS, // TODO: canonical V4Quoter on Base Sepolia
    permit2: PERMIT2_ADDRESS,
    spryHook: PLACEHOLDER_ADDRESS, // TODO: deployed SpryHook
    spryRouter: PLACEHOLDER_ADDRESS, // TODO: deployed SpryRouter
  },
  startBlock: 19088197,
  blockWindowHint: 6, // ~2s blocks
  subgraphUrl: null, // TODO: deployed Spry subgraph endpoint
};

export const UNICHAIN_SEPOLIA: SpryChainConfig = {
  chainId: ChainId.UNICHAIN_SEPOLIA,
  key: 'unichain-sepolia',
  name: 'Unichain Sepolia',
  testnet: true,
  addresses: {
    poolManager: '0x00b036b58a818b1bc34d502d3fe730db729e62ac',
    positionManager: '0xf969aee60879c54baaed9f3ed26147db216fd664',
    quoter: PLACEHOLDER_ADDRESS, // TODO: canonical V4Quoter on Unichain Sepolia
    permit2: PERMIT2_ADDRESS,
    spryHook: PLACEHOLDER_ADDRESS, // TODO: deployed SpryHook
    spryRouter: PLACEHOLDER_ADDRESS, // TODO: deployed SpryRouter
  },
  startBlock: 7092034,
  blockWindowHint: 12, // ~1s blocks (informational; read BLOCK_WINDOW() on-chain)
  subgraphUrl: null, // TODO: deployed Spry subgraph endpoint
};

/** All configured chains, keyed by chain id. */
export const SPRY_CHAINS: Record<number, SpryChainConfig> = {
  [SEPOLIA.chainId]: SEPOLIA,
  [BASE_SEPOLIA.chainId]: BASE_SEPOLIA,
  [UNICHAIN_SEPOLIA.chainId]: UNICHAIN_SEPOLIA,
};

/** Chain ids Spry is configured for. */
export const SUPPORTED_CHAIN_IDS: number[] = Object.values(SPRY_CHAINS).map((c) => c.chainId);

/** Default chain for the app to select when none is connected. */
export const DEFAULT_CHAIN_ID: number = ChainId.BASE_SEPOLIA;
