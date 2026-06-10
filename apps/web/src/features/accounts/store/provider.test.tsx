import { CONNECTION_PROVIDER_IDS } from 'uniswap/src/constants/web3'
import { ConnectorStatus } from 'uniswap/src/features/accounts/store/types/Connector'
import { ChainScopeType } from 'uniswap/src/features/accounts/store/types/Session'
import { SigningCapability } from 'uniswap/src/features/accounts/store/types/Wallet'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { useAccountsStoreContext } from '~/features/accounts/store/provider'
import { renderHook } from '~/test-utils/render'

// Mock wagmi hooks
const mockUseWagmiAccount = vitest.fn()
const mockUseWagmiConnectors = vitest.fn()
const mockUseWagmiChainId = vitest.fn()
const mockUsePendingConnectorId = vitest.fn()

vi.mock('wagmi', async () => ({
  ...(await vi.importActual('wagmi')),
  useAccount: () => mockUseWagmiAccount(),
  useConnectors: () => mockUseWagmiConnectors(),
  useChainId: () => mockUseWagmiChainId(),
}))

vi.mock('@universe/gating', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    useFeatureFlag: vi.fn(),
  }
})

vi.mock('~/features/wallet/connection/connectors/state', () => ({
  usePendingConnectorId: () => mockUsePendingConnectorId(),
}))

describe('Web Accounts Store Provider', () => {
  const createMockWagmiConnector = (overrides = {}) => ({
    id: 'metamask',
    name: 'MetaMask',
    icon: 'metamask-icon',
    type: CONNECTION_PROVIDER_IDS.INJECTED_CONNECTOR_TYPE,
    ...overrides,
  })

  const createMockWagmiAccount = (overrides = {}) => ({
    address: '0x1234567890123456789012345678901234567890',
    chainId: 1,
    status: 'connected' as const,
    connector: createMockWagmiConnector(),
    ...overrides,
  })

  const renderWithProvider = () => {
    return renderHook(() => useAccountsStoreContext())
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockUseWagmiAccount.mockReturnValue(createMockWagmiAccount())
    mockUseWagmiConnectors.mockReturnValue([createMockWagmiConnector()])
    mockUseWagmiChainId.mockReturnValue(1)
    mockUsePendingConnectorId.mockReturnValue(null)
  })

  describe('Given a connected MetaMask wallet on EVM', () => {
    it('When the provider builds the accounts state, Then it should create the correct EVM connector and wallet', () => {
      // Given
      const wagmiAccount = createMockWagmiAccount({
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        status: 'connected',
      })
      const wagmiConnector = createMockWagmiConnector({
        id: 'metamask',
        name: 'MetaMask',
        type: CONNECTION_PROVIDER_IDS.INJECTED_CONNECTOR_TYPE,
      })

      mockUseWagmiAccount.mockReturnValue(wagmiAccount)
      mockUseWagmiConnectors.mockReturnValue([wagmiConnector])

      // When
      const { result } = renderWithProvider()
      const state = result.current.getState()

      // Then
      expect(state.activeConnectors.evm).toBeDefined()
      expect(state.activeConnectors.evm?.platform).toBe(Platform.EVM)
      expect(state.activeConnectors.evm?.status).toBe(ConnectorStatus.Connected)
      expect(state.activeConnectors.evm?.access).toBe('Injected')
      expect(state.activeConnectors.evm?.externalLibraryId).toBe('metamask')

      expect(state.wallets).toHaveProperty('metamask')
      expect(state.wallets.metamask.name).toBe('MetaMask')
      expect(state.wallets.metamask.signingCapability).toBe(SigningCapability.Interactive)
      expect(state.wallets.metamask.addresses[0].evm).toBe('0x1234567890123456789012345678901234567890')

      expect(state.accounts).toHaveProperty('0x1234567890123456789012345678901234567890')
      expect(state.accounts['0x1234567890123456789012345678901234567890'].platform).toBe(Platform.EVM)
      expect(state.accounts['0x1234567890123456789012345678901234567890'].walletId).toBe('metamask')
    })
  })

  describe('Given a connecting wallet', () => {
    it('When the provider builds the accounts state, Then it should set the connector status to Connecting', () => {
      // Given
      const wagmiAccount = createMockWagmiAccount({
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        status: 'connecting',
      })

      mockUseWagmiAccount.mockReturnValue(wagmiAccount)

      // When
      const { result } = renderWithProvider()
      const state = result.current.getState()

      // Then
      expect(state.activeConnectors.evm?.status).toBe(ConnectorStatus.Connecting)
    })
  })

  describe('Given a disconnected wallet', () => {
    it('When the provider builds the accounts state, Then it should not include the connector in activeConnectors', () => {
      // Given
      const wagmiAccount = createMockWagmiAccount({
        address: undefined,
        chainId: 1,
        status: 'disconnected',
      })

      mockUseWagmiAccount.mockReturnValue(wagmiAccount)

      // When
      const { result } = renderWithProvider()
      const state = result.current.getState()

      // Then
      expect(state.activeConnectors.evm).toBeUndefined()
      expect(state.connectors).toHaveProperty('WagmiConnector_metamask')
      expect(state.connectors.WagmiConnector_metamask.status).toBe(ConnectorStatus.Disconnected)
    })
  })

  describe('Given a wallet with unsupported chain', () => {
    it('When the provider builds the accounts state, Then it should create a session with unsupported chain info', () => {
      // Given
      const wagmiAccount = createMockWagmiAccount({
        address: '0x1234567890123456789012345678901234567890',
        chainId: 999, // Unsupported chain
        status: 'connected',
      })

      mockUseWagmiAccount.mockReturnValue(wagmiAccount)

      // Mock console.error to prevent test failure
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // When
      const { result } = renderWithProvider()
      const state = result.current.getState()

      // Then
      const session = state.activeConnectors.evm?.session
      expect(session).toBeDefined()
      expect(session?.chainScope.type).toBe(ChainScopeType.SingleChain)
      expect(session?.chainScope.currentChain.supportedByApp).toBe(false)
      expect((session?.chainScope.currentChain as any).unsupportedChain).toBe(999)

      // Clean up
      consoleSpy.mockRestore()
    })
  })

  describe('Given a pending connector', () => {
    it('When the provider builds the accounts state, Then it should treat the pending connector as active', () => {
      // Given
      const wagmiAccount = createMockWagmiAccount({
        address: undefined,
        chainId: 1,
        status: 'disconnected',
      })
      const wagmiConnector = createMockWagmiConnector({
        id: 'metamask',
        name: 'MetaMask',
      })

      mockUseWagmiAccount.mockReturnValue(wagmiAccount)
      mockUseWagmiConnectors.mockReturnValue([wagmiConnector])
      mockUsePendingConnectorId.mockReturnValue('metamask')

      // When
      const { result } = renderWithProvider()
      const state = result.current.getState()

      // Then
      // Pending connectors are not included in activeConnectors when disconnected
      expect(state.activeConnectors.evm).toBeUndefined()
      expect(state.connectors).toHaveProperty('WagmiConnector_metamask')
      expect(state.connectors.WagmiConnector_metamask.status).toBe(ConnectorStatus.Disconnected)
    })
  })

  describe('Given multiple EVM connectors', () => {
    it('When the provider builds the accounts state, Then it should create connectors for all wallets', () => {
      // Given
      const wagmiAccount = createMockWagmiAccount({
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        status: 'connected',
      })
      const metamaskConnector = createMockWagmiConnector({
        id: 'metamask',
        name: 'MetaMask',
        type: CONNECTION_PROVIDER_IDS.INJECTED_CONNECTOR_TYPE,
      })
      const coinbaseConnector = createMockWagmiConnector({
        id: 'coinbase',
        name: 'Coinbase Wallet',
        type: 'coinbaseWallet',
      })

      mockUseWagmiAccount.mockReturnValue(wagmiAccount)
      mockUseWagmiConnectors.mockReturnValue([metamaskConnector, coinbaseConnector])

      // When
      const { result } = renderWithProvider()
      const state = result.current.getState()

      // Then
      expect(state.connectors).toHaveProperty('WagmiConnector_metamask')
      expect(state.connectors).toHaveProperty('WagmiConnector_coinbase')
      expect(state.wallets).toHaveProperty('metamask')
      expect(state.wallets).toHaveProperty('coinbase')
    })
  })

  describe('Given a wallet with SDK access pattern', () => {
    it('When the provider builds the accounts state, Then it should set the access pattern to SDK', () => {
      // Given
      const wagmiConnector = createMockWagmiConnector({
        id: 'walletconnect',
        name: 'WalletConnect',
        type: 'walletConnect', // Not injected
      })

      mockUseWagmiConnectors.mockReturnValue([wagmiConnector])

      // When
      const { result } = renderWithProvider()
      const state = result.current.getState()

      // Then
      expect(state.connectors.WagmiConnector_walletconnect.access).toBe('SDK')
    })
  })

  describe('Given a connected wallet without account info', () => {
    it('When the provider builds the accounts state, Then it should throw an error', () => {
      // Given
      const wagmiAccount = createMockWagmiAccount({
        address: undefined,
        chainId: 1,
        status: 'connected', // Connected but no address
      })

      mockUseWagmiAccount.mockReturnValue(wagmiAccount)

      // Mock console.error to prevent test failure
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // When & Then
      expect(() => {
        const { result } = renderWithProvider()
        // Access the state to trigger the error
        result.current.getState()
      }).toThrow('Connected status with no account info provided is not supported.')

      // Clean up
      consoleSpy.mockRestore()
    })
  })

  describe('Given the provider context', () => {
    it('When accessing the accounts store, Then it should provide all getter functions', () => {
      // Given
      const { result } = renderWithProvider()

      // When
      const store = result.current

      // Then
      expect(store.getState().getActiveAddress).toBeDefined()
      expect(store.getState().getActiveAddresses).toBeDefined()
      expect(store.getState().getActiveAccount).toBeDefined()
      expect(store.getState().getActiveWallet).toBeDefined()
      expect(store.getState().getConnectionStatus).toBeDefined()
      expect(store.getState().getActiveConnector).toBeDefined()
    })

    it('When calling getter functions, Then they should work correctly', () => {
      // Given
      const { result } = renderWithProvider()

      // When
      const evmAddress = result.current.getState().getActiveAddress(Platform.EVM)
      const svmAddress = result.current.getState().getActiveAddress(Platform.SVM)
      const connectionStatus = result.current.getState().getConnectionStatus(Platform.EVM)

      // Then
      expect(evmAddress).toBe('0x1234567890123456789012345678901234567890')
      // SPRY: Solana support is pruned; no SVM connector ever exists.
      expect(svmAddress).toBeUndefined()
      expect(connectionStatus).toMatchObject({
        status: ConnectorStatus.Connected,
        isConnected: true,
        isConnecting: false,
        isDisconnected: false,
      })
    })
  })
})
