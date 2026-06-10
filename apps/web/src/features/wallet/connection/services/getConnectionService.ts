import { useMemo } from 'react'
import { CONNECTION_PROVIDER_IDS } from 'uniswap/src/constants/web3'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { useEvent } from 'utilities/src/react/hooks'
import { useAccountsStore } from '~/features/accounts/store/hooks'
import type { ExternalConnector, ExternalWallet } from '~/features/accounts/store/types'
import {
  useUniswapEmbeddedConnectionService,
  useUniswapMobileConnectionService,
} from '~/features/wallet/connection/connectors/custom'
import { getEVMConnectionService } from '~/features/wallet/connection/connectors/wagmi'
import type { ConnectionService } from '~/features/wallet/connection/services/IConnectionService'

type GetConnectionServiceFn = (params: { wallet: ExternalWallet; individualPlatform?: Platform }) => ConnectionService

function useGetConnector() {
  const connectors = useAccountsStore((state) => state.connectors)
  return useEvent(<P extends Platform>(connectorId: string, platform: P): ExternalConnector<P> | undefined => {
    const connector = connectors[connectorId] as ExternalConnector | undefined
    if (connector?.platform !== platform) {
      return undefined
    }
    return connector as ExternalConnector<P>
  })
}

/**
 * Returns a function capable of returning the proper connection service for a given wallet.
 * SPRY: Solana support is pruned; every wallet connects through the EVM service.
 */
export function useGetConnectionService(): GetConnectionServiceFn {
  const getConnector = useGetConnector()
  const evmConnectionService = useMemo(() => getEVMConnectionService(getConnector), [getConnector])

  const uniswapEmbeddedService = useUniswapEmbeddedConnectionService()
  const uniswapMobileService = useUniswapMobileConnectionService()

  const overrides: Partial<Record<string, ConnectionService>> = useMemo(() => {
    return {
      [CONNECTION_PROVIDER_IDS.EMBEDDED_WALLET_CONNECTOR_ID]: uniswapEmbeddedService,
      [CONNECTION_PROVIDER_IDS.UNISWAP_WALLET_CONNECT_CONNECTOR_ID]: uniswapMobileService,
    }
  }, [uniswapEmbeddedService, uniswapMobileService])

  return useEvent((params) => {
    // For wallets that have non-standard connection behavior
    const overrideService = overrides[params.wallet.id]
    if (overrideService) {
      return overrideService
    }

    return evmConnectionService
  })
}
