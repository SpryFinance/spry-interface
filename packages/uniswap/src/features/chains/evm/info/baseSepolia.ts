import { GraphQLApi, TradingApi } from '@universe/api'
import { BASE_LOGO, ETH_LOGO } from 'ui/src/assets'
import { CHAIN_ID_TO_URL_PARAM } from 'uniswap/src/features/chains/chainUrlParam'
import { DEFAULT_NATIVE_ADDRESS_LEGACY } from 'uniswap/src/features/chains/evm/rpc'
import { buildChainTokens } from 'uniswap/src/features/chains/evm/tokens'
import { GENERIC_L2_GAS_CONFIG } from 'uniswap/src/features/chains/gasDefaults'
import {
  GqlChainId,
  NetworkLayer,
  RPCType,
  UniverseChainId,
  UniverseChainInfo,
} from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { buildUSDC } from 'uniswap/src/features/tokens/stablecoin'
import { baseSepolia } from 'wagmi/chains'

// Base Sepolia is the network the Spry protocol is deployed on. It is not a chain
// the upstream Uniswap app shipped with, so it is added here. The Uniswap gateway
// does not serve data for it (backendSupported: false); Spry data comes from the
// Spry subgraph / Quoter / StateView via the @spry/* packages instead.
const testnetTokens = buildChainTokens({
  stables: {
    // Circle USDC on Base Sepolia (used for the stablecoin/spot-price slot only).
    USDC: buildUSDC('0x036CbD53842c5426634e7929541eC2318f3dCF7e', UniverseChainId.BaseSepolia),
  },
})

export const BASE_SEPOLIA_CHAIN_INFO = {
  ...baseSepolia,
  name: 'Base Sepolia',
  testnet: true,
  id: UniverseChainId.BaseSepolia,
  platform: Platform.EVM,
  assetRepoNetworkName: undefined,
  backendChain: {
    chain: GraphQLApi.Chain.BaseSepolia as GqlChainId,
    backendSupported: false,
    nativeTokenBackendAddress: undefined,
  },
  blockPerMainnetEpochForChainId: 1,
  blockWaitMsBeforeWarning: undefined,
  bridge: undefined,
  docs: 'https://docs.base.org/docs/',
  elementName: ElementName.ChainBaseSepolia,
  explorer: {
    name: 'BaseScan',
    url: 'https://sepolia.basescan.org/',
  },
  interfaceName: 'base_sepolia',
  label: 'Base Sepolia',
  logo: BASE_LOGO,
  nativeCurrency: {
    name: 'Base Sepolia ETH',
    symbol: 'ETH',
    decimals: 18,
    address: DEFAULT_NATIVE_ADDRESS_LEGACY,
    logo: ETH_LOGO,
  },
  networkLayer: NetworkLayer.L2,
  blockTimeMs: 2000,
  pendingTransactionsRetryOptions: undefined,
  rpcUrls: {
    [RPCType.Public]: { http: ['https://sepolia.base.org'] },
    [RPCType.Default]: { http: ['https://sepolia.base.org'] },
    [RPCType.Interface]: { http: ['https://sepolia.base.org'] },
  },
  tokens: testnetTokens,
  statusPage: undefined,
  supportedURVersions: [TradingApi.UniversalRouterVersion._2_0, TradingApi.UniversalRouterVersion._2_1_1],
  supportsV4: true,
  supportsNFTs: false,
  urlParam: CHAIN_ID_TO_URL_PARAM[UniverseChainId.BaseSepolia],
  wrappedNativeCurrency: {
    name: 'Wrapped Ether',
    symbol: 'WETH',
    decimals: 18,
    address: '0x4200000000000000000000000000000000000006',
  },
  gasConfig: GENERIC_L2_GAS_CONFIG,
  tradingApiPollingIntervalMs: 150,
} as const satisfies UniverseChainInfo
