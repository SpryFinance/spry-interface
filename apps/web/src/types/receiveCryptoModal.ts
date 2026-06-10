// SPRY: the CEX-transfer (fiat on-ramp) modal states were removed; only receive-to-address and QR remain.
export enum ReceiveModalState {
  DEFAULT = 0,
  QR_CODE = 2,
}

export type ReceiveCryptoModalInitialState =
  | { modalState: ReceiveModalState.DEFAULT }
  | { modalState: ReceiveModalState.QR_CODE; qrCodeAddress: string }
