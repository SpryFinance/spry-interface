// Per-chain Spry configuration.
//
// The three networks here are exactly the ones the Spry subgraph indexes
// (see spry-subgraph/networks.json). Base Sepolia is DEPLOYED + verified
// on-chain; Sepolia and Unichain Sepolia are still pre-deployment.
//
//   - poolManager / positionManager: REAL canonical V4 addresses.
//   - permit2: the universal canonical Permit2 address.
//   - quoter / stateView: REAL canonical v4-periphery on Base Sepolia;
//     PLACEHOLDER on the other chains (fill from the canonical deployment,
//     https://docs.uniswap.org/contracts/v4/deployments).
//   - spryHook / spryRouter: DEPLOYED on Base Sepolia (verified on-chain);
//     still PLACEHOLDER on Sepolia and Unichain Sepolia until deployed there.
//   - subgraphUrl: set on Base Sepolia (Goldsky); null on the other chains.
//   - startBlock: the SpryHook deploy block on Base Sepolia; provisional
//     (canonical V4 block) on the other chains until deployed.
//
// Uniswap's Universal Router and the PoolSwapTest / PoolModifyLiquidityTest
// helpers are intentionally NOT tracked: Spry swaps go through SpryRouter only.
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
    stateView: PLACEHOLDER_ADDRESS, // TODO: canonical StateView on Sepolia
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
    positionManager: '0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80',
    quoter: '0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa', // canonical V4Quoter (verified on-chain)
    stateView: '0x571291b572ed32ce6751a2Cb2486EbEe8DEfB9B4', // canonical StateView (verified on-chain)
    permit2: PERMIT2_ADDRESS,
    spryHook: '0x43C99D40E2E7FBa44435bFC6Da57a74d38fD0080', // deployed + verified on-chain
    spryRouter: '0xd4Af9FFDf2067d4CA422526D308E08CDBE690642', // deployed + verified on-chain
    // canonical PoolModifyLiquidityTest: the seeding scripts' LP router (verified as the sender of
    // every indexed ModifyLiquidity event); the LP write flows target it for raw (non-NFT) positions.
    poolModifyLiquidityTest: '0x37429cd17cb1454c34e7f50b09725202fd533039',
  },
  startBlock: 42508548, // SpryHook deploy block on Base Sepolia
  blockWindowHint: 30, // confirmed from the deployed BLOCK_WINDOW() (authoritative value is on-chain)
  // Spry subgraph on Goldsky (indexing healthy; serving data).
  subgraphUrl:
    'https://api.goldsky.com/api/public/project_cmls3noc9jy1l01uy0cr74jok/subgraphs/spry-subgraph/1.0.0/gn',
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
    stateView: PLACEHOLDER_ADDRESS, // TODO: canonical StateView on Unichain Sepolia
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
