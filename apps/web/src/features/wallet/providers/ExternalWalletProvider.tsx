import { PropsWithChildren, useMemo } from 'react'
import { WalletProvider } from 'uniswap/src/features/wallet/contexts/WalletProvider'
import { createWalletService } from 'uniswap/src/features/wallet/services/createWalletService'
import { getExternalEVMWalletService } from '~/features/wallet/services/ExternalEVMWalletService'
import { useAccount } from '~/hooks/useAccount'

// SPRY: Solana support is pruned; the external wallet service is EVM-only.
export function ExternalWalletProvider({ children }: PropsWithChildren): JSX.Element {
  const evmAccountAddress = useAccount().address

  const walletService = useMemo(() => createWalletService({ evmWalletService: getExternalEVMWalletService() }), [])

  return (
    <WalletProvider walletService={walletService} evmAddress={evmAccountAddress}>
      {children}
    </WalletProvider>
  )
}
