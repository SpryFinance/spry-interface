import { useTranslation } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { Wallet } from 'ui/src/components/icons/Wallet'
import { useAccountDrawer } from '~/components/AccountDrawer/MiniPortfolio/hooks'
import { BUTTON_AREA_WIDTH } from '~/features/Liquidity/components/emptyStates/PositionsEmptyStateLayout'

// SPRY: the "Providing liquidity on different protocols" / "Hooks on v4" learn-more
// tiles (LiquidityLearnMoreTiles) are pruned from the disconnected state for the testnet
// phase - they link to Uniswap's help center. RESTORE FOR MAINNET: re-import
// LiquidityLearnMoreTiles and render it after the connect card (repointed at Spry docs).
export function DisconnectedWalletView() {
  const { t } = useTranslation()
  const accountDrawer = useAccountDrawer()

  const handleConnectWallet = () => {
    accountDrawer.open()
  }

  return (
    <Flex
      padding="$spacing24"
      centered
      gap="$gap16"
      borderRadius="$rounded20"
      borderColor="$surface3"
      borderWidth="$spacing1"
      borderStyle="solid"
    >
        <Flex padding="$padding12" borderRadius="$rounded12" backgroundColor="$surface3">
          <Wallet size="$icon.24" color="$neutral1" />
        </Flex>
        <Flex gap="$gap4" centered>
          <Text variant="subheading1">{t('positions.welcome.connect.wallet')}</Text>
          <Text variant="body2" color="$neutral2">
            {t('positions.welcome.connect.description')}
          </Text>
        </Flex>
        <Flex row gap="$gap8" $md={{ flexDirection: 'column', width: '100%' }} width={BUTTON_AREA_WIDTH}>
          <Button
            $md={{
              py: '$spacing16',
            }}
            variant="default"
            size="small"
            emphasis="secondary"
            tag="a"
            href="/positions/create"
            $platform-web={{
              textDecoration: 'none',
            }}
          >
            {t('position.new')}
          </Button>
          <Button
            $md={{
              py: '$spacing16',
            }}
            variant="default"
            size="small"
            borderRadius="$rounded12"
            onPress={handleConnectWallet}
          >
            {t('common.connectWallet.button')}
          </Button>
        </Flex>
      </Flex>
  )
}
