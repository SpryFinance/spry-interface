import { SPRY_DEPLOYED_CHAIN_IDS } from '@spry/config'
import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { Token } from '@uniswap/sdk-core'
import { GraphQLApi } from '@universe/api'
import { PollingInterval } from 'uniswap/src/constants/misc'
import { ALL_CHAIN_IDS, getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { EnabledChainsInfo, GqlChainId, NetworkLayer, UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'

// Some code from the web app uses chainId types as numbers
// This validates them as coerces into SupportedChainId
export function toSupportedChainId(chainId?: BigNumberish): UniverseChainId | null {
  if (!chainId || !ALL_CHAIN_IDS.map((c) => c.toString()).includes(chainId.toString())) {
    return null
  }
  return parseInt(chainId.toString(), 10) as UniverseChainId
}

export function getChainLabel(chainId: UniverseChainId): string {
  return getChainInfo(chainId).label
}

/**
 * Return the explorer name for the given chain ID
 * @param chainId the ID of the chain for which to return the explorer name
 */
export function getChainExplorerName(chainId: UniverseChainId): string {
  return getChainInfo(chainId).explorer.name
}

export function isTestnetChain(chainId: UniverseChainId): boolean {
  return Boolean(getChainInfo(chainId).testnet)
}

export function isBackendSupportedChainId(chainId: UniverseChainId): boolean {
  const info = getChainInfo(chainId)
  return info.backendChain.backendSupported
}

export function isBackendSupportedChain(chain: GraphQLApi.Chain): chain is GqlChainId {
  const chainId = fromGraphQLChain(chain)
  if (!chainId) {
    return false
  }

  return isBackendSupportedChainId(chainId)
}

export function chainIdToHexadecimalString(chainId: UniverseChainId): string {
  return BigNumber.from(chainId).toHexString()
}

export function hexadecimalStringToInt(hex: string): number {
  return parseInt(hex, 16)
}

export function isL2ChainId(chainId?: UniverseChainId): boolean {
  return chainId !== undefined && getChainInfo(chainId).networkLayer === NetworkLayer.L2
}

export function isMainnetChainId(chainId?: UniverseChainId): boolean {
  return chainId === UniverseChainId.Mainnet || chainId === UniverseChainId.Sepolia
}

export function toGraphQLChain(chainId: UniverseChainId): GqlChainId {
  return getChainInfo(chainId).backendChain.chain
}

export function fromGraphQLChain(chain: GraphQLApi.Chain | string | undefined): UniverseChainId | null {
  switch (chain) {
    case GraphQLApi.Chain.Ethereum:
      return UniverseChainId.Mainnet
    case GraphQLApi.Chain.Arbitrum:
      return UniverseChainId.ArbitrumOne
    case GraphQLApi.Chain.Avalanche:
      return UniverseChainId.Avalanche
    case GraphQLApi.Chain.Base:
      return UniverseChainId.Base
    case GraphQLApi.Chain.BaseSepolia:
      return UniverseChainId.BaseSepolia
    case GraphQLApi.Chain.Bnb:
      return UniverseChainId.Bnb
    case GraphQLApi.Chain.Blast:
      return UniverseChainId.Blast
    case GraphQLApi.Chain.Celo:
      return UniverseChainId.Celo
    case GraphQLApi.Chain.Linea:
      return UniverseChainId.Linea
    case GraphQLApi.Chain.Megaeth:
      return UniverseChainId.MegaETH
    case GraphQLApi.Chain.Monad:
      return UniverseChainId.Monad
    case GraphQLApi.Chain.Optimism:
      return UniverseChainId.Optimism
    case GraphQLApi.Chain.Polygon:
      return UniverseChainId.Polygon
    case GraphQLApi.Chain.EthereumSepolia:
      return UniverseChainId.Sepolia
    case GraphQLApi.Chain.Unichain:
      return UniverseChainId.Unichain
    case GraphQLApi.Chain.Solana:
      return UniverseChainId.Solana
    case GraphQLApi.Chain.Soneium:
      return UniverseChainId.Soneium
    case GraphQLApi.Chain.Xlayer:
      return UniverseChainId.XLayer
    case GraphQLApi.Chain.AstrochainSepolia:
      return UniverseChainId.UnichainSepolia
    case GraphQLApi.Chain.Worldchain:
      return UniverseChainId.WorldChain
    case GraphQLApi.Chain.Zksync:
      return UniverseChainId.Zksync
    case GraphQLApi.Chain.Zora:
      return UniverseChainId.Zora
    case GraphQLApi.Chain.Tempo:
      return UniverseChainId.Tempo
  }

  return null
}

export function getPollingIntervalByBlocktime(chainId?: UniverseChainId): PollingInterval {
  return isMainnetChainId(chainId) ? PollingInterval.Fast : PollingInterval.LightningMcQueen
}

export function fromUniswapWebAppLink(network: string | null): UniverseChainId {
  switch (network) {
    case GraphQLApi.Chain.Ethereum.toLowerCase():
      return UniverseChainId.Mainnet
    case GraphQLApi.Chain.Arbitrum.toLowerCase():
      return UniverseChainId.ArbitrumOne
    case GraphQLApi.Chain.Avalanche.toLowerCase():
      return UniverseChainId.Avalanche
    case GraphQLApi.Chain.Base.toLowerCase():
      return UniverseChainId.Base
    case GraphQLApi.Chain.Blast.toLowerCase():
      return UniverseChainId.Blast
    case GraphQLApi.Chain.Bnb.toLowerCase():
      return UniverseChainId.Bnb
    case GraphQLApi.Chain.Celo.toLowerCase():
      return UniverseChainId.Celo
    case GraphQLApi.Chain.Linea.toLowerCase():
      return UniverseChainId.Linea
    case GraphQLApi.Chain.Megaeth.toLowerCase():
      return UniverseChainId.MegaETH
    case GraphQLApi.Chain.Monad.toLowerCase():
      return UniverseChainId.Monad
    case GraphQLApi.Chain.Optimism.toLowerCase():
      return UniverseChainId.Optimism
    case GraphQLApi.Chain.Polygon.toLowerCase():
      return UniverseChainId.Polygon
    case GraphQLApi.Chain.EthereumSepolia.toLowerCase():
      return UniverseChainId.Sepolia
    case GraphQLApi.Chain.Unichain.toLowerCase():
      return UniverseChainId.Unichain
    case GraphQLApi.Chain.Soneium.toLowerCase():
      return UniverseChainId.Soneium
    case GraphQLApi.Chain.Xlayer.toLowerCase():
      return UniverseChainId.XLayer
    case GraphQLApi.Chain.AstrochainSepolia.toLowerCase():
    case 'unichain_sepolia':
      return UniverseChainId.UnichainSepolia
    case GraphQLApi.Chain.Worldchain.toLowerCase():
      return UniverseChainId.WorldChain
    case GraphQLApi.Chain.Zksync.toLowerCase():
      return UniverseChainId.Zksync
    case GraphQLApi.Chain.Zora.toLowerCase():
      return UniverseChainId.Zora
    case GraphQLApi.Chain.Tempo.toLowerCase():
      return UniverseChainId.Tempo
    default:
      throw new Error(`Network "${network}" can not be mapped`)
  }
}

const CHAIN_ID_TO_UNISWAP_WEB_APP_LINK: Partial<Record<UniverseChainId, string>> = {
  [UniverseChainId.ArbitrumOne]: GraphQLApi.Chain.Arbitrum.toLowerCase(),
  [UniverseChainId.Avalanche]: GraphQLApi.Chain.Avalanche.toLowerCase(),
  [UniverseChainId.Base]: GraphQLApi.Chain.Base.toLowerCase(),
  [UniverseChainId.Blast]: GraphQLApi.Chain.Blast.toLowerCase(),
  [UniverseChainId.Bnb]: GraphQLApi.Chain.Bnb.toLowerCase(),
  [UniverseChainId.Celo]: GraphQLApi.Chain.Celo.toLowerCase(),
  [UniverseChainId.Linea]: GraphQLApi.Chain.Linea.toLowerCase(),
  [UniverseChainId.Mainnet]: GraphQLApi.Chain.Ethereum.toLowerCase(),
  [UniverseChainId.MegaETH]: GraphQLApi.Chain.Megaeth.toLowerCase(),
  [UniverseChainId.Monad]: GraphQLApi.Chain.Monad.toLowerCase(),
  [UniverseChainId.Optimism]: GraphQLApi.Chain.Optimism.toLowerCase(),
  [UniverseChainId.Polygon]: GraphQLApi.Chain.Polygon.toLowerCase(),
  [UniverseChainId.Sepolia]: GraphQLApi.Chain.EthereumSepolia.toLowerCase(),
  [UniverseChainId.Soneium]: GraphQLApi.Chain.Soneium.toLowerCase(),
  [UniverseChainId.Tempo]: GraphQLApi.Chain.Tempo.toLowerCase(),
  [UniverseChainId.Unichain]: GraphQLApi.Chain.Unichain.toLowerCase(),
  [UniverseChainId.UnichainSepolia]: 'unichain_sepolia',
  [UniverseChainId.WorldChain]: GraphQLApi.Chain.Worldchain.toLowerCase(),
  [UniverseChainId.XLayer]: GraphQLApi.Chain.Xlayer.toLowerCase(),
  [UniverseChainId.Zksync]: GraphQLApi.Chain.Zksync.toLowerCase(),
  [UniverseChainId.Zora]: GraphQLApi.Chain.Zora.toLowerCase(),
}

export function toUniswapWebAppLink(chainId: UniverseChainId): string | null {
  const network = CHAIN_ID_TO_UNISWAP_WEB_APP_LINK[chainId]

  if (!network) {
    throw new Error(`ChainID "${chainId}" can not be mapped`)
  }

  return network
}

export function filterChainIdsByFeatureFlag(featureFlaggedChainIds: {
  [key in UniverseChainId]?: boolean
}): UniverseChainId[] {
  return ALL_CHAIN_IDS.filter((chainId) => {
    return featureFlaggedChainIds[chainId] ?? true
  })
}

/**
 * Filters chain IDs by platform (EVM or SVM)
 * @param chainIds Array of chain IDs to filter (as numbers)
 * @param platform Platform to filter by (EVM or SVM)
 * @returns Filtered array of chain IDs matching the specified platform
 */
export function filterChainIdsByPlatform<T extends number>(chainIds: T[], platform: Platform): T[] {
  return chainIds.filter<T>((chainId): chainId is T => {
    const universeChainId = chainId as UniverseChainId
    if (!ALL_CHAIN_IDS.includes(universeChainId)) {
      return false
    }
    const chainInfo = getChainInfo(universeChainId)
    return chainInfo.platform === platform
  })
}

// Spry interface: the app is hardcoded to Spry's deployed chains (Unichain
// Sepolia first, then Base Sepolia). The testnet-mode toggle and chain feature
// flags are intentionally bypassed so they are always available. Sourced from
// @spry/config so a new deployment (or Sepolia going live) flows through
// automatically, in that package's display order.
const SPRY_ENABLED_CHAIN_IDS: UniverseChainId[] = SPRY_DEPLOYED_CHAIN_IDS as UniverseChainId[]

export function getEnabledChains({
  platform,
  isTestnetModeEnabled,
}: {
  platform?: Platform
  isTestnetModeEnabled: boolean
  featureFlaggedChainIds: UniverseChainId[]
  includeTestnets?: boolean
}): EnabledChainsInfo {
  // Only Spry's deployed chains, in SPRY_ENABLED_CHAIN_IDS order (Unichain
  // Sepolia first). `includeTestnets` / `isTestnetModeEnabled` and
  // `featureFlaggedChainIds` are ignored on purpose (see SPRY_ENABLED_CHAIN_IDS).
  const enabledChainInfos = SPRY_ENABLED_CHAIN_IDS.map((id) => getChainInfo(id)).filter(
    (chainInfo) => platform === undefined || platform === chainInfo.platform,
  )

  const chains = enabledChainInfos.map((chainInfo) => chainInfo.id)
  const gqlChains = enabledChainInfos.map((chainInfo) => chainInfo.backendChain.chain)

  return {
    chains,
    gqlChains,
    defaultChainId: getDefaultChainId({ platform, isTestnetModeEnabled }),
    isTestnetModeEnabled,
  }
}

function getDefaultChainId({ platform }: { platform?: Platform; isTestnetModeEnabled: boolean }): UniverseChainId {
  if (platform === Platform.SVM) {
    // TODO(Solana): is there a Solana testnet we can return here?
    return UniverseChainId.Solana
  }

  // Spry interface: default to Spry's first deployed chain (Unichain Sepolia) for EVM.
  return (SPRY_ENABLED_CHAIN_IDS[0] ?? UniverseChainId.UnichainSepolia) as UniverseChainId
}

/** Returns all stablecoins for a given chainId. */
export function getStablecoinsForChain(chainId: UniverseChainId): Token[] {
  return getChainInfo(chainId).tokens.stablecoins
}

/** Checks if a token address is a stablecoin on the given chain. */
export function isStablecoinAddress(chainId: UniverseChainId, tokenAddress: string): boolean {
  try {
    const stablecoins = getStablecoinsForChain(chainId)
    return stablecoins.some((stablecoin) => stablecoin.address.toLowerCase() === tokenAddress.toLowerCase())
  } catch {
    return false
  }
}

/** Returns the primary stablecoin for a given chainId. */
export function getPrimaryStablecoin(chainId: UniverseChainId): Token {
  return getChainInfo(chainId).tokens.stablecoins[0]
}

export function isUniverseChainId(chainId?: number | UniverseChainId | null): chainId is UniverseChainId {
  return !!chainId && ALL_CHAIN_IDS.includes(chainId as UniverseChainId)
}
