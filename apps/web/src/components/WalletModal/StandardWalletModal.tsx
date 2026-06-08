import { useTranslation } from 'react-i18next'
import { Flex, Text } from 'ui/src'
import { WalletModalLayout } from '~/components/WalletModal/WalletModalLayout'
import { WalletOptionsGrid } from '~/components/WalletModal/WalletOptionsGrid'

export function StandardWalletModal(): JSX.Element {
  const { t } = useTranslation()

  const header = (
    <Flex row justifyContent="space-between" width="100%">
      <Text variant="subheading2">{t('common.connectAWallet.button')}</Text>
    </Flex>
  )

  // SPRY: the Uniswap Wallet options are removed, so there is no primary-vs-"other"
  // split. Show the available external connectors directly under the header.
  const walletOptions = (
    <WalletOptionsGrid showMobileConnector={false} showOtherWallets={false} maxHeight="100vh" opacity={1} />
  )

  return <WalletModalLayout header={header}>{walletOptions}</WalletModalLayout>
}
