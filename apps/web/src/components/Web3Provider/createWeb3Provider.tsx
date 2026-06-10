import { type ReactNode } from 'react'
import { type Register, WagmiProvider } from 'wagmi'
import { useWalletCapabilitiesStateEffect } from '~/state/walletCapabilities/hooks/useWalletCapabilitiesStateEffect'

// SPRY: Solana support is pruned; the provider tree is wagmi (EVM) only.
export function createWeb3Provider(params: { wagmiConfig: Register['config']; reconnectOnMount?: boolean }) {
  const { wagmiConfig, reconnectOnMount = true } = params

  const Provider = ({ children }: { children: ReactNode }) => (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={reconnectOnMount}>
      {children}
    </WagmiProvider>
  )

  Provider.displayName = 'Web3Provider'

  return Provider
}

export function WalletCapabilitiesEffects() {
  useWalletCapabilitiesStateEffect()
  return null
}
