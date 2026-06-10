import type { WalletService } from 'uniswap/src/features/wallet/services/IWalletService'

// SPRY: Solana support is pruned; the wallet service is EVM-only.
export function createWalletService(ctx: { evmWalletService?: WalletService }): WalletService {
  const service: WalletService = {
    getWallet(params) {
      const { evmAddress } = params

      return { ...ctx.evmWalletService?.getWallet({ evmAddress }) }
    },
  }

  return service
}
