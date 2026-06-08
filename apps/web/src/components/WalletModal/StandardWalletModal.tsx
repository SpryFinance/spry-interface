import { useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { Flex, Separator, Text } from 'ui/src'
import { ChevronsIn } from 'ui/src/components/icons/ChevronsIn'
import { ChevronsOut } from 'ui/src/components/icons/ChevronsOut'
import { WalletModalLayout } from '~/components/WalletModal/WalletModalLayout'
import { WalletOptionsGrid } from '~/components/WalletModal/WalletOptionsGrid'
import { ClickableTamaguiStyle } from '~/theme/components/styles'

export function StandardWalletModal(): JSX.Element {
  const { t } = useTranslation()
  const [expandMoreWallets, toggleExpandMoreWallets] = useReducer((s) => !s, true)

  const header = (
    <Flex row justifyContent="space-between" width="100%">
      <Text variant="subheading2">{t('common.connectAWallet.button')}</Text>
    </Flex>
  )

  // SPRY: the Uniswap Wallet promo block (extension / mobile / download) is hidden;
  // the grid below shows the standard external connectors.
  const expandToggle = (
    <Flex row alignItems="center" py={8} userSelect="none" onPress={toggleExpandMoreWallets} {...ClickableTamaguiStyle}>
      <Separator />
      <Flex row alignItems="center" mx={18}>
        <Text variant="body3" color="$neutral2" whiteSpace="nowrap">
          {t('wallet.other')}
        </Text>
        {expandMoreWallets ? <ChevronsIn size={20} color="$neutral3" /> : <ChevronsOut size={20} color="$neutral3" />}
      </Flex>
      <Separator />
    </Flex>
  )

  const walletOptions = (
    <WalletOptionsGrid
      showMobileConnector={false}
      showOtherWallets={false}
      maxHeight={expandMoreWallets ? '100vh' : '0'}
      opacity={expandMoreWallets ? 1 : 0}
    />
  )

  return (
    <WalletModalLayout
      header={
        <Flex gap="$gap16">
          {header}
          {expandToggle}
        </Flex>
      }
    >
      {walletOptions}
    </WalletModalLayout>
  )
}
