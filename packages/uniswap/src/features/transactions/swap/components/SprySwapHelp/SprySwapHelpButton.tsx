import { useCallback, useEffect, useState } from 'react'
import { Flex, TouchableArea } from 'ui/src'
import { QuestionInCircle } from 'ui/src/components/icons/QuestionInCircle'
import { Modal } from 'uniswap/src/components/modals/Modal'
import { ModalName } from 'uniswap/src/features/telemetry/constants'
import { SprySwapExplainer } from 'uniswap/src/features/transactions/swap/components/SprySwapHelp/SprySwapExplainer'

// SPRY: remember that the user has seen the swap explainer for 10 days, so it
// auto-opens on a first visit (or after the window lapses) but not every load.
const SEEN_AT_KEY = 'spry.swapHelpSeenAt'
const REMEMBER_MS = 10 * 24 * 60 * 60 * 1000

function shouldAutoShow(): boolean {
  try {
    const raw = window.localStorage.getItem(SEEN_AT_KEY)
    if (!raw) {
      return true
    }
    const seenAt = Number(raw)
    return !Number.isFinite(seenAt) || Date.now() - seenAt >= REMEMBER_MS
  } catch {
    // Private mode / storage disabled: never auto-pop so we cannot nag on every load.
    return false
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_AT_KEY, String(Date.now()))
  } catch {
    // ignore storage failures
  }
}

/**
 * SPRY: a "?" help button that sits beside the swap settings gear and opens the
 * "how a swap works" explainer in a modal. Auto-opens once on a first visit and
 * remembers (10 days) so it does not reopen on every load. Rendered web-only
 * (gated by the caller), positioned to align with the settings gear.
 */
export function SprySwapHelpButton(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)

  // Auto-open once on a first visit. We mark it seen on close (not here) so React
  // StrictMode's dev double-mount can't flip the flag before the persisted mount
  // opens it, and so "seen" means the user actually dismissed it.
  useEffect(() => {
    if (shouldAutoShow()) {
      setIsOpen(true)
    }
  }, [])

  const handleClose = useCallback(() => {
    markSeen()
    setIsOpen(false)
  }, [])

  return (
    <Flex
      position="absolute"
      top={-38}
      right={42}
      height={32}
      alignItems="center"
      justifyContent="center"
      zIndex="$default"
    >
      <TouchableArea
        hitSlop={8}
        hoverStyle={{ opacity: 0.7 }}
        testID="spry-swap-help-button"
        onPress={() => setIsOpen(true)}
      >
        <QuestionInCircle size="$icon.24" color="$neutral2" />
      </TouchableArea>
      <Modal
        name={ModalName.SprySwapHelp}
        isModalOpen={isOpen}
        alignment="center"
        maxWidth={460}
        backgroundColor="$surface1"
        padding="$spacing24"
        onClose={handleClose}
      >
        <SprySwapExplainer />
      </Modal>
    </Flex>
  )
}
