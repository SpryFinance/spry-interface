// SPRY: the limit/buy/sell pages were pruned, which removed pages/Swap/Limit/ConfirmSwapModal.
// Toucan's bid review reuses these two generic confirm-modal state machines, so they are
// re-homed here (Toucan is now their only consumer).

export enum ConfirmModalState {
  REVIEWING = 0,
  WRAPPING = 1,
  RESETTING_TOKEN_ALLOWANCE = 2,
  APPROVING_TOKEN = 3,
  PERMITTING = 4,
  PENDING_CONFIRMATION = 5,
}

export enum PendingModalError {
  TOKEN_APPROVAL_ERROR = 0,
  PERMIT_ERROR = 1,
  XV2_HARD_QUOTE_ERROR = 2,
  CONFIRMATION_ERROR = 3,
  WRAP_ERROR = 4,
}
