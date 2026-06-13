import { logger } from 'utilities/src/logger/logger'
import { UniverseChainId } from './types'

export interface UniRpcConfig {
  rpcUrl: string
  headers: Record<string, string>
  getRequestHeaders?: () => Promise<Record<string, string>>
  credentials?: 'include'
}

interface UniRpcConfigResolverCtx {
  getFeatureFlag: () => boolean
  getEntryGatewayUrl: () => string
  requestSource: string
  getRequestHeaders?: () => Promise<Record<string, string>>
  credentials?: 'include'
}

interface UniRpcConfigResolverInput {
  chainId: UniverseChainId
}

/**
 * Creates a resolver that returns UniRPC configuration when the feature gate is enabled.
 *
 * UniRPC is a unified JSON-RPC proxy that handles provider selection, health monitoring, and failover
 * across all supported chains. When enabled, all chain-level RPC calls route through the entry gateway
 * at /rpc/{chainId} instead of direct provider endpoints (QuickNode, Infura, etc.).
 *
 * @example
 * ```ts
 * const resolveUniRpcConfig = createUniRpcConfigResolver({
 *   getFeatureFlag: () => getFeatureFlag(FeatureFlags.UniRpcEnabled),
 *   getEntryGatewayUrl,
 * })
 *
 * const config = resolveUniRpcConfig({ chainId: UniverseChainId.Mainnet })
 * if (config) {
 *   // use unirpc
 * }
 * ```
 */
export function createUniRpcConfigResolver(ctx: UniRpcConfigResolverCtx) {
  return (input: UniRpcConfigResolverInput): UniRpcConfig | null => {
    try {
      // SPRY: the Spry chains are NOT served by the Uniswap entry-gateway RPC proxy
      // (`${baseUrl}/rpc/<chainId>` returns 401), so skip UniRPC for them and let the
      // resolver fall back to each chain's direct RPC (sepolia.base.org /
      // sepolia.unichain.org, from UNIVERSE_CHAIN_INFO). Add new Spry chains here.
      if (
        input.chainId === UniverseChainId.BaseSepolia ||
        input.chainId === UniverseChainId.UnichainSepolia
      ) {
        return null
      }

      if (!ctx.getFeatureFlag()) {
        return null
      }

      const baseUrl = ctx.getEntryGatewayUrl()
      return {
        rpcUrl: `${baseUrl}/rpc/${input.chainId}`,
        headers: {
          'x-request-source': ctx.requestSource,
        },
        getRequestHeaders: ctx.getRequestHeaders,
        credentials: ctx.credentials,
      }
    } catch (error) {
      logger.error(error, {
        tags: { file: 'getUniRpcConfig', function: 'createUniRpcConfigResolver' },
        extra: { chainId: input.chainId },
      })
      return null
    }
  }
}
