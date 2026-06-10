import { useMemo } from 'react'
import { CONNECTION_PROVIDER_IDS, CONNECTION_PROVIDER_NAMES } from 'uniswap/src/constants/web3'
import type { Account } from 'uniswap/src/features/accounts/store/types/Account'
import { AccessPattern, Connector, ConnectorStatus } from 'uniswap/src/features/accounts/store/types/Connector'
import { ChainScopeType } from 'uniswap/src/features/accounts/store/types/Session'
import { SigningCapability } from 'uniswap/src/features/accounts/store/types/Wallet'
import { createAccountsStoreContextProvider } from 'uniswap/src/features/accounts/store/utils/createAccountsStoreContextProvider'
import { CAIP25Session } from 'uniswap/src/features/capabilities/caip25/types'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { EVMUniverseChainId } from 'uniswap/src/features/chains/types'
import { isUniverseChainId } from 'uniswap/src/features/chains/utils'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import type { PlatformSpecificAddress } from 'uniswap/src/features/platforms/types/PlatformSpecificAddress'
import { isChainIdOnPlatform } from 'uniswap/src/features/platforms/utils/chains'
import {
  UseAccountReturnType,
  useCapabilities,
  // oxlint-disable-next-line no-restricted-imports -- direct wagmi hooks needed for web wallet integration
  useAccount as useWagmiAccount,
  // oxlint-disable-next-line no-restricted-imports -- direct wagmi hooks needed for web wallet integration
  useChainId as useWagmiChainId,
  useConnectors as useWagmiConnectors,
  Connector as WagmiConnector,
} from 'wagmi'
import { CONNECTOR_ICON_OVERRIDE_MAP } from '~/connection/constants'
import { walletTypeToAmplitudeWalletType } from '~/connection/walletConnect'
import { buildCAIP25Session } from '~/features/accounts/store/buildCAIP25Session'
import { createAccountsStoreGetters } from '~/features/accounts/store/getters'
import type {
  ExternalConnector,
  ExternalSession,
  ExternalWallet,
  WebAccountsData,
} from '~/features/accounts/store/types'
import { normalizeWalletName } from '~/features/wallet/connection/connectors/multiplatform'
import { useConnectWalletMutation } from '~/features/wallet/connection/hooks/useConnectWalletMutation'
import { useOneClickSwapSetting } from '~/pages/Swap/settings/OneClickSwap'

/**
 * Web package implementation of the unified accounts store architecture.
 * Transforms external wallet data (wagmi) into our common format, providing
 * consistent APIs across web, mobile, and shared packages.
 * SPRY: Solana support is pruned; only EVM (wagmi) wallets are sourced.
 */

/** Utility intermediary type, for storing a flat representation of a single wallet/account/connector grouping, for a single wallet on one platform. */
type PlatformWalletInfo<P extends Platform> = {
  platform: P
  /** A identifier provided by the external library that sources a wallet. */
  libraryId: string
  connectorId: string
  walletName: string
  walletIcon?: string
  connectorStatus: ConnectorStatus
  accountInfo?: {
    address: PlatformSpecificAddress<P>
    chainId: number
  }
  injected: boolean

  deduplicationId: string
  analyticsWalletType: string
}

/** Maps wagmi connection statuses to our unified ConnectorStatus enum. */
const WAGMI_STATUS_TO_CONNECTOR_STATUS = {
  // We currently do not differentiate between reconnecting and connecting states.
  reconnecting: ConnectorStatus.Connecting,
  connecting: ConnectorStatus.Connecting,
  connected: ConnectorStatus.Connected,
  disconnected: ConnectorStatus.Disconnected,
}

/** Builds platform wallet info from wagmi connector and account data. */
function buildEVMWalletInfo(params: {
  connector: Pick<WagmiConnector, 'id' | 'type' | 'name' | 'icon'>
  accountData: UseAccountReturnType | undefined
  fallbackChainId: EVMUniverseChainId
}): PlatformWalletInfo<Platform.EVM> {
  const { connector, accountData, fallbackChainId } = params

  const connectorStatus = accountData
    ? WAGMI_STATUS_TO_CONNECTOR_STATUS[accountData.status]
    : ConnectorStatus.Disconnected

  const injected = connector.type === CONNECTION_PROVIDER_IDS.INJECTED_CONNECTOR_TYPE
  const walletIcon = connector.icon
  const walletName = connector.name
  const deduplicationId = normalizeWalletName(connector.name)
  const libraryId = connector.id
  const connectorId = 'WagmiConnector_' + libraryId

  const address = accountData?.address
  const chainId = accountData?.chainId ?? fallbackChainId

  const accountInfo = address ? { address, chainId } : undefined

  return {
    platform: Platform.EVM,
    connectorId,
    libraryId,
    walletName,
    walletIcon,
    connectorStatus,
    accountInfo,
    injected,
    deduplicationId,
    analyticsWalletType: walletTypeToAmplitudeWalletType(connector.type),
  }
}

/** Creates a session with single-chain scope for external wallet connections. */
function buildSession<P extends Platform>(params: {
  walletId: string
  platform: P
  currentChainId: number
  caip25Session?: CAIP25Session
}): ExternalSession<P> {
  const { walletId, platform, currentChainId, caip25Session } = params

  return {
    walletId,
    currentAccountIndex: 0,
    chainScope: {
      type: ChainScopeType.SingleChain,
      supportedChains: 'all',
      currentChain:
        isUniverseChainId(currentChainId) && isChainIdOnPlatform(currentChainId, platform)
          ? { supportedByApp: true, currentChainId }
          : { supportedByApp: false, unsupportedChain: currentChainId },
    },
    caip25Info: caip25Session,
  }
}

/** Creates an Account from platform wallet info if account data is available. */
function buildAccount<P extends Platform>(info: PlatformWalletInfo<P>, walletId: string): Account<P> | undefined {
  if (info.accountInfo) {
    return {
      walletId,
      platform: info.platform,
      address: info.accountInfo.address,
    }
  }
  return undefined
}

/** Creates an ExternalConnector from platform wallet info with appropriate access pattern. */
function buildConnector<P extends Platform>({
  info,
  walletId,
  caip25Session,
}: {
  info: PlatformWalletInfo<P>
  walletId: string
  caip25Session?: CAIP25Session
}): Connector<P, ExternalSession<P>> {
  const access = info.injected ? AccessPattern.Injected : AccessPattern.SDK
  const status = info.connectorStatus
  const id = info.connectorId

  if (status === ConnectorStatus.Disconnected) {
    return { id, access, status, session: undefined }
  }

  if (info.accountInfo) {
    const session = buildSession({
      walletId,
      platform: info.platform,
      currentChainId: info.accountInfo.chainId,
      caip25Session,
    })

    return { id, access, status, session }
  }

  if (status === ConnectorStatus.Connected) {
    throw new Error('Connected status with no account info provided is not supported.')
  }

  return { id, access, status, session: undefined }
}

/** Creates an EVM-specific connector with external library ID. */
function buildEVMConnector({
  info,
  walletId,
  caip25Session,
}: {
  info: PlatformWalletInfo<Platform.EVM>
  walletId: string
  caip25Session: CAIP25Session
}): ExternalConnector<Platform.EVM> {
  return {
    ...buildConnector({ info, walletId, caip25Session }),
    platform: info.platform,
    externalLibraryId: info.libraryId,
  }
}

/** Builds complete store components (wallet, connectors, accounts) from wallet info. */
function buildStoreComponents({
  evm,
  caip25Session,
}: {
  evm?: PlatformWalletInfo<Platform.EVM>
  caip25Session: CAIP25Session
}): {
  wallet: ExternalWallet
  evmConnector?: ExternalConnector<Platform.EVM>
  accounts: Account<Platform>[]
} {
  const infos: PlatformWalletInfo<Platform>[] = [evm].flatMap((info) => (info ? [info] : []))
  const {
    libraryId: walletId,
    walletName,
    walletIcon,
    analyticsWalletType,
  } = infos.reduce((acc, info) => ({ ...info, ...acc }))

  const accounts: Account<Platform>[] = infos.flatMap((info) => buildAccount(info, walletId) ?? [])

  const evmConnector = evm ? buildEVMConnector({ info: evm, walletId, caip25Session }) : undefined

  const wallet: ExternalWallet = {
    id: walletId,
    name: walletName,
    icon: CONNECTOR_ICON_OVERRIDE_MAP[walletName] ?? walletIcon,
    signingCapability: SigningCapability.Interactive,
    addresses: [
      accounts.reduce(
        (acc, account) => ({ ...acc, [account.platform]: account.address }),
        {} as { [P in Platform]?: PlatformSpecificAddress<P> },
      ),
    ],
    connectorIds: {
      [Platform.EVM]: evmConnector?.id,
    },
    analyticsWalletType,
  }

  return { wallet, evmConnector, accounts }
}

/** Maps deduplication ids to the wallet infos that share that id (to deduplicate info for the same wallet on different platforms). */
type DeduplicationMap = {
  [id in string]: {
    [Platform.EVM]?: PlatformWalletInfo<Platform.EVM>
  }
}

/** Groups wallet infos by deduplication ID to handle cross-platform wallet instances. */
function buildDeduplicationMap(infos: PlatformWalletInfo<Platform>[]): DeduplicationMap {
  const map: DeduplicationMap = {}

  for (const info of infos) {
    const key = info.deduplicationId
    map[key] = { [info.platform]: info, ...map[key] }
  }
  return map
}

/** Builds the complete accounts state from platform wallet infos with deduplication. */
function buildAccountsState({
  infos,
  isConnecting,
  caip25Session,
}: {
  infos: PlatformWalletInfo<Platform>[]
  isConnecting: boolean
  caip25Session: CAIP25Session
}): Omit<WebAccountsData, 'connectionQuery'> {
  const activeConnectors: WebAccountsData['activeConnectors'] = {}
  const connectors: WebAccountsData['connectors'] = {}
  const accounts: WebAccountsData['accounts'] = {}
  const wallets: WebAccountsData['wallets'] = {}

  // Infos will contain separate entries for e.g. MetaMask on EVM vs MetaMask on SVM; these need to be deduplicated.
  const deduplicationMap = buildDeduplicationMap(infos)

  for (const crossPlatformInfos of Object.values(deduplicationMap)) {
    // Step 1: Build the store components, deduplicating cross platform data for the same wallet if needed.
    const components = buildStoreComponents({ ...crossPlatformInfos, caip25Session })

    // Step 2: Store all connectors + references to active connectors.
    if (components.evmConnector) {
      if (components.evmConnector.status !== ConnectorStatus.Disconnected) {
        activeConnectors.evm = components.evmConnector
      }
      connectors[components.evmConnector.id] = components.evmConnector
    }

    // Step 3: Store all accounts.
    for (const account of components.accounts) {
      accounts[account.address] = account
    }

    // Step 4: Store the wallet.
    wallets[components.wallet.id] = components.wallet
  }

  return { wallets, connectors, accounts, activeConnectors, connectionQueryIsPending: isConnecting }
}

// Uniswap wallet connect connector conflicts with the normal WC connector, so we leave it out of our config and add it manually here.
const UNISWAP_WALLET_CONNECTOR = {
  id: CONNECTION_PROVIDER_IDS.UNISWAP_WALLET_CONNECT_CONNECTOR_ID,
  type: 'uniswapWalletConnect',
  name: CONNECTION_PROVIDER_NAMES.UNISWAP_WALLET,
  icon: CONNECTOR_ICON_OVERRIDE_MAP[CONNECTION_PROVIDER_NAMES.UNISWAP_WALLET],
}

/** Hook that builds EVM wallet infos from wagmi connectors and account data. */
function useEVMWalletInfos(pendingConnection: ExternalWallet | undefined): PlatformWalletInfo<Platform.EVM>[] {
  const wagmiAccount = useWagmiAccount()
  const connectors = useWagmiConnectors()
  const fallbackChainId = useWagmiChainId()

  return useMemo(() => {
    return [...connectors, UNISWAP_WALLET_CONNECTOR].map((connector) => {
      const currentConnectorIsActive =
        connector.id === wagmiAccount.connector?.id || pendingConnection?.id === connector.id
      const accountData = currentConnectorIsActive ? wagmiAccount : undefined
      return buildEVMWalletInfo({ connector, accountData, fallbackChainId })
    })
  }, [connectors, wagmiAccount, fallbackChainId, pendingConnection])
}

/** Main hook that builds the unified accounts state from EVM wallet data. */
function useAccountsState(): WebAccountsData {
  const { pendingWallet, isConnecting } = useConnectWalletMutation()

  const evmWalletInfos = useEVMWalletInfos(pendingWallet)
  const caip25Session = useCAIP25Session()

  return useMemo(
    () => buildAccountsState({ infos: evmWalletInfos, isConnecting, caip25Session }),
    [evmWalletInfos, isConnecting, caip25Session],
  )
}

/** Web package accounts store provider and context hook. */
export const { AccountsStoreContextProvider: WebAccountsStoreProvider, useAccountsStoreContext } =
  createAccountsStoreContextProvider({
    useAppAccountsState: useAccountsState,
    createGetters: createAccountsStoreGetters,
  })

function useCAIP25Session(): CAIP25Session {
  const { data: capabilities } = useCapabilities()
  const { connector, address } = useWagmiAccount()
  const { chains: enabledChains } = useEnabledChains()
  const { enabled: isOneClickSwapEnabled } = useOneClickSwapSetting()

  return useMemo(() => {
    return buildCAIP25Session({
      connector,
      address,
      capabilities,
      enabledChains,
      includeAtomicCapability: isOneClickSwapEnabled,
    })
  }, [capabilities, connector, address, enabledChains, isOneClickSwapEnabled])
}
