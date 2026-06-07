import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { MenuStateVariant, useSetMenuCallback } from '~/components/AccountDrawer/menuState'
import { EmbeddedWalletConnectionsModal } from '~/components/WalletModal/EmbeddedWalletModal'
import { StandardWalletModal } from '~/components/WalletModal/StandardWalletModal'
import { SwitchWalletModal } from '~/components/WalletModal/SwitchWalletModal'
import { getPrivyConfig } from '~/config'

export function WalletModal({ connectOnPlatform }: { connectOnPlatform?: Platform | 'any' }) {
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)
  const onClose = useSetMenuCallback(MenuStateVariant.MAIN)

  if (connectOnPlatform) {
    return <SwitchWalletModal connectOnPlatform={connectOnPlatform} onClose={onClose} />
  }

  // The embedded-wallet modal uses Privy hooks that require a configured
  // PrivyProvider (see MaybePrivyProvider in index.tsx). When Privy is not
  // configured (e.g. local dev without PRIVY_APP_ID), fall back to the standard
  // wallet modal instead of crashing on undefined Privy context.
  const { appId, clientId } = getPrivyConfig(false)
  const isPrivyConfigured = Boolean(appId && clientId)

  return isEmbeddedWalletEnabled && isPrivyConfigured ? <EmbeddedWalletConnectionsModal /> : <StandardWalletModal />
}
