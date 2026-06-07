import { Language } from 'uniswap/src/features/language/constants'
import { deviceAccessTimeoutToMinutes } from 'uniswap/src/features/settings/constants'
import { UniswapState } from 'uniswap/src/state/uniswapReducer'

export const selectWalletHideSmallBalancesSetting = (state: UniswapState): boolean =>
  state.userSettings.hideSmallBalances

export const selectWalletHideSpamTokensSetting = (state: UniswapState): boolean => state.userSettings.hideSpamTokens

export const selectWalletHideReportedActivitySetting = (state: UniswapState): boolean =>
  state.userSettings.hideReportedActivity ?? true

export const selectCurrentLanguage = (state: UniswapState): Language => state.userSettings.currentLanguage

// Spry interface: the app runs only on Base Sepolia, which is a testnet, so
// testnet mode is always on. This keeps token lists, data queries, and chain
// logic in testnet mode (otherwise the app runs in "mainnet mode" on a
// testnet-only chain and surfaces mainnet tokens / wrong defaults). Forcing it
// true also resets any stale persisted mainnet chain via the compatibility check
// in useInitialCurrencyState. Overrides the user/persisted setting on purpose.
export const selectIsTestnetModeEnabled = (_state: UniswapState): boolean => true

export const selectDeviceAccessTimeoutMinutes = (state: UniswapState): number | undefined =>
  deviceAccessTimeoutToMinutes(state.userSettings.deviceAccessTimeout)

export const selectEnableCustomGasFeeEntry = (state: UniswapState): boolean =>
  state.userSettings.enableCustomGasFeeEntry
