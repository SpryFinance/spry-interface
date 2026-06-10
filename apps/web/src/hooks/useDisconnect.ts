import { tryCatch } from 'utilities/src/errors'
import { logger } from 'utilities/src/logger/logger'
import { useEvent } from 'utilities/src/react/hooks'
// oxlint-disable-next-line no-restricted-imports -- wagmi hook needed for wallet disconnection
import { useDisconnect as useDisconnectWagmi } from 'wagmi'

// SPRY: Solana support is pruned; disconnect only handles EVM (wagmi) wallets.
export function useDisconnect(): () => void {
  const { disconnect: disconnectWagmi, connectors } = useDisconnectWagmi()

  return useEvent(() => {
    const { error } = tryCatch(() => {
      connectors.forEach((connector) => disconnectWagmi({ connector }))
    })
    if (error) {
      logger.error(error, { tags: { file: 'useDisconnect.ts', function: 'useDisconnect' } })
    }
  })
}
