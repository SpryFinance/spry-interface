import { useEffect } from 'react'
import { AnimateTransition } from 'ui/src'
import { GetHelpHeader } from 'uniswap/src/components/dialog/GetHelpHeader'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ReceiveQRCode } from 'uniswap/src/components/ReceiveQRCode/ReceiveQRCode'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { logger } from 'utilities/src/logger/logger'
import { useEvent } from 'utilities/src/react/hooks'
import { ChooseProvider } from '~/components/ReceiveCryptoModal/ChooseProvider'
import { useOpenReceiveCryptoModal } from '~/components/ReceiveCryptoModal/useOpenReceiveCryptoModal'
import { useConnectionStatus } from '~/features/accounts/store/hooks'
import { useModalInitialState } from '~/hooks/useModalInitialState'
import { useModalState } from '~/hooks/useModalState'
import { ContentWrapper } from '~/pages/Swap/Buy/shared'
import { ReceiveModalState } from '~/types/receiveCryptoModal'

// SPRY: the CEX-transfer (fiat on-ramp) flow was removed; this modal now only supports
// receiving to your address (DEFAULT) and the per-address QR code.
export function ReceiveCryptoModal() {
  const modalState = useModalInitialState(ModalName.ReceiveCryptoModal)
  const { isOpen, closeModal } = useModalState(ModalName.ReceiveCryptoModal)

  const qrCodeAddress = modalState?.modalState === ReceiveModalState.QR_CODE ? modalState.qrCodeAddress : undefined
  const currentModalState = modalState?.modalState

  const onClose = useEvent(() => {
    closeModal()
  })

  const navigateToDefault = useOpenReceiveCryptoModal({
    modalState: ReceiveModalState.DEFAULT,
  })
  const goBack = useEvent(() => {
    navigateToDefault()
  })

  // Close modal if account becomes disconnected - use useEffect to avoid infinite re-renders
  const isDisconnected = useConnectionStatus('aggregate').isDisconnected
  useEffect(() => {
    if (isDisconnected && isOpen) {
      logger.debug('ReceiveCryptoModal', 'ReceiveCryptoModal', 'Modal opened with invalid state. Closing modal.')
      onClose()
    }
  }, [isDisconnected, isOpen, onClose])

  if (isDisconnected) {
    return null
  }

  const currentIndex = currentModalState === ReceiveModalState.QR_CODE ? 1 : 0

  return (
    <Modal name={ModalName.ReceiveCryptoModal} isModalOpen={isOpen} onClose={onClose} maxWidth={420}>
      <ContentWrapper>
        <GetHelpHeader
          goBack={currentModalState === ReceiveModalState.QR_CODE ? goBack : undefined}
          link={uniswapUrls.helpArticleUrls.transferCryptoHelp}
          closeModal={onClose}
        />
        <AnimateTransition currentIndex={currentIndex} animationType="forward">
          <ChooseProvider />
          {qrCodeAddress ? <ReceiveQRCode address={qrCodeAddress} /> : null}
        </AnimateTransition>
      </ContentWrapper>
    </Modal>
  )
}

export default ReceiveCryptoModal
