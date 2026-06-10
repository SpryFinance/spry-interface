import { FetchError, isRateLimitFetchError, TradingApi } from '@universe/api'
import { TFunction } from 'i18next'
import { Warning, WarningAction, WarningLabel, WarningSeverity } from 'uniswap/src/components/modals/WarningModal/types'

export function getSwapWarningFromError({ error, t }: { error: Error; t: TFunction }): Warning {
  if (error instanceof FetchError) {
    // Special case: rate limit errors are not parsed by errorCode
    if (isRateLimitFetchError(error)) {
      return {
        type: WarningLabel.RateLimit,
        severity: WarningSeverity.Medium,
        action: WarningAction.DisableReview,
        title: t('swap.warning.rateLimit.title'),
        message: t('swap.warning.rateLimit.message'),
      }
    }

    // Map errorCode to Warning
    switch (error.data?.errorCode) {
      case TradingApi.Err404.errorCode.QUOTE_AMOUNT_TOO_LOW_ERROR: {
        return {
          type: WarningLabel.EnterLargerAmount,
          severity: WarningSeverity.Low,
          action: WarningAction.DisableReview,
          title: t('swap.warning.enterLargerAmount.title'),
          message: undefined,
        }
      }

      // SPRY: cross-chain bridging is pruned (single-chain app), so the
      // bridge-specific no-quotes variant is gone.
      case TradingApi.Err404.errorCode.RESOURCE_NOT_FOUND: {
        return {
          type: WarningLabel.NoRoutesError,
          severity: WarningSeverity.Low,
          action: WarningAction.DisableReview,
          title: t('swap.warning.noRoutesFound.title'),
          // SPRY: put the verdict on the disabled button itself, so an
          // unfillable amount is impossible to mistake for a broken form.
          buttonText: t('swap.warning.noRoutesFound.title'),
          message: t('swap.warning.noRoutesFound.message'),
        }
      }
    }
  }

  // Generic routing error if we can't parse a specific case
  return {
    type: WarningLabel.SwapRouterError,
    severity: WarningSeverity.Low,
    action: WarningAction.DisableReview,
    title: t('swap.warning.router.title'),
    message: t('swap.warning.router.message'),
  }
}
