import { useTranslation } from 'react-i18next'
import { Flex, GeneratedIcon, IconButton, Text, TouchableArea } from 'ui/src'
import { CopySheets } from 'ui/src/components/icons/CopySheets'
import { QrCode } from 'ui/src/components/icons/QrCode'
import { useUnitagsAddressQuery } from 'uniswap/src/data/apiClients/unitagsApi/useUnitagsAddressQuery'
import { useENSName } from 'uniswap/src/features/ens/api'
import { AccountOption } from '~/components/ReceiveCryptoModal/AccountOption'
import { useOpenReceiveCryptoModal } from '~/components/ReceiveCryptoModal/useOpenReceiveCryptoModal'
import { useActiveAddresses } from '~/features/accounts/store/hooks'
import { CopyToClipboard } from '~/theme/components/CopyHelper'
import { ReceiveModalState } from '~/types/receiveCryptoModal'

// SPRY: the "transfer from a CEX" (fiat on-ramp) section was removed; this modal now only shows
// the user's address(es) for receiving crypto directly.

function ActionIcon({ Icon }: { Icon: GeneratedIcon }) {
  return <IconButton emphasis="secondary" size="xxsmall" icon={<Icon />} />
}

function AccountCardItem({ address }: { address: Address }): JSX.Element {
  const { data: unitag } = useUnitagsAddressQuery({
    params: address ? { address } : undefined,
  })
  const { data: ENSName } = useENSName(address)

  const onPressShowWalletQr = useOpenReceiveCryptoModal({
    modalState: ReceiveModalState.QR_CODE,
    qrCodeAddress: address,
  })

  return (
    <Flex row alignItems="flex-start" gap="$spacing12">
      <Flex
        fill
        row
        borderColor="$surface3"
        borderRadius="$rounded20"
        borderWidth="$spacing1"
        gap="$spacing12"
        p="$spacing12"
      >
        <Flex fill>
          <AccountOption account={address} ensUsername={ENSName} uniswapUsername={unitag?.username} />
        </Flex>
        <Flex centered row gap="$spacing12" px="$spacing8">
          <CopyToClipboard toCopy={address}>
            <ActionIcon Icon={CopySheets} />
          </CopyToClipboard>
          <TouchableArea onPress={onPressShowWalletQr}>
            <ActionIcon Icon={QrCode} />
          </TouchableArea>
        </Flex>
      </Flex>
    </Flex>
  )
}

export function ChooseProvider(): JSX.Element {
  const { t } = useTranslation()
  const activeAddresses = useActiveAddresses()

  return (
    <Flex grow gap="$spacing24" mb="$spacing16">
      <Flex gap="$spacing4" p="$spacing8" pt="$spacing24">
        <Text color="$neutral1" mt="$spacing2" textAlign="center" variant="subheading1">
          {t('fiatOnRamp.receiveCrypto.title')}
        </Text>
        <Text color="$neutral2" mt="$spacing2" textAlign="center" variant="body3">
          {t('fiatOnRamp.receiveCrypto.transferFunds')}
        </Text>
      </Flex>
      <Flex gap="$spacing12">
        {activeAddresses.evmAddress && <AccountCardItem address={activeAddresses.evmAddress} />}
        {activeAddresses.svmAddress && <AccountCardItem address={activeAddresses.svmAddress} />}
      </Flex>
    </Flex>
  )
}
