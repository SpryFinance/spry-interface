import { type GasStrategy, TradingApi } from '@universe/api'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { TransactionSettings } from 'uniswap/src/features/transactions/components/settings/types'
import type { ApprovalTxInfo } from 'uniswap/src/features/transactions/swap/review/hooks/useTokenApprovalInfo'
import type { EVMSwapInstructionsService } from 'uniswap/src/features/transactions/swap/review/services/swapTxAndGasInfoService/evm/evmSwapInstructionsService'
import type { TransactionRequestInfo } from 'uniswap/src/features/transactions/swap/review/services/swapTxAndGasInfoService/utils'
import {
  createProcessSwapResponse,
  getSwapInputExceedsBalance,
} from 'uniswap/src/features/transactions/swap/review/services/swapTxAndGasInfoService/utils'
import { buildSprySwapTransactionInfo } from 'uniswap/src/features/transactions/swap/services/tradeService/sprySwapTransaction'
import { buildSpryWrapTransactionInfo } from 'uniswap/src/features/transactions/swap/services/tradeService/spryWrapTransaction'
import type { DerivedSwapInfo } from 'uniswap/src/features/transactions/swap/types/derivedSwapInfo'
import type {
  BridgeTrade,
  ClassicTrade,
  UnwrapTrade,
  WrapTrade,
} from 'uniswap/src/features/transactions/swap/types/trade'
import { ApprovalAction } from 'uniswap/src/features/transactions/swap/types/trade'
import { tryCatch } from 'utilities/src/errors'

type GetEVMSwapTransactionRequestInfoFn = (params: {
  trade: ClassicTrade | BridgeTrade | WrapTrade | UnwrapTrade
  approvalTxInfo: ApprovalTxInfo
  derivedSwapInfo: DerivedSwapInfo
}) => Promise<TransactionRequestInfo>

export function createGetEVMSwapTransactionRequestInfo(ctx: {
  instructionService: EVMSwapInstructionsService
  gasStrategy: GasStrategy
  transactionSettings: TransactionSettings
  /**
   * Set true when the upstream quote was built with per-tx gas overrides;
   * forwarded through `createProcessSwapResponse` so the displayed value
   * matches what the user explicitly set.
   */
  hasOverrides?: boolean
  /** SPRY: the connected account, used as the swap recipient when building the
   * SpryRouter call locally on Base Sepolia. */
  account?: string
}): GetEVMSwapTransactionRequestInfoFn {
  const { gasStrategy, transactionSettings, instructionService, hasOverrides } = ctx

  const processSwapResponse = createProcessSwapResponse({ gasStrategy, hasOverrides })

  const getEVMSwapTransactionRequestInfo: GetEVMSwapTransactionRequestInfoFn = async ({
    trade,
    approvalTxInfo,
    derivedSwapInfo,
  }) => {
    // SPRY: the Trading API /swap endpoint does not serve Base Sepolia, so build the
    // SpryRouter calldata locally for the Spry pool's classic trades.
    if (
      trade.routing === TradingApi.Routing.CLASSIC &&
      ctx.account &&
      derivedSwapInfo.chainId === UniverseChainId.BaseSepolia
    ) {
      const sprySwapInfo = await buildSprySwapTransactionInfo({ trade, account: ctx.account })
      if (sprySwapInfo) {
        return sprySwapInfo
      }
    }

    // SPRY: wrap/unwrap (ETH <-> WETH) on Base Sepolia is a local WETH deposit/withdraw
    // (the gateway /swap 401s here too).
    if (
      (trade.routing === TradingApi.Routing.WRAP || trade.routing === TradingApi.Routing.UNWRAP) &&
      derivedSwapInfo.chainId === UniverseChainId.BaseSepolia
    ) {
      const wrapInfo = await buildSpryWrapTransactionInfo({ trade })
      if (wrapInfo) {
        return wrapInfo
      }
    }

    const { tokenApprovalInfo } = approvalTxInfo

    const swapQuoteResponse = trade.quote
    const swapQuote = swapQuoteResponse.quote

    const approvalAction = tokenApprovalInfo.action
    const approvalUnknown = approvalAction === ApprovalAction.Unknown

    const skip = getSwapInputExceedsBalance({ derivedSwapInfo }) || approvalUnknown
    const { data, error } = await tryCatch(
      skip
        ? Promise.resolve(undefined)
        : instructionService.getSwapInstructions({ swapQuoteResponse, transactionSettings, approvalAction }),
    )

    const isRevokeNeeded = tokenApprovalInfo.action === ApprovalAction.RevokeAndPermit2Approve
    const swapTxInfo = processSwapResponse({
      response: data?.response ?? undefined,
      error,
      permitData: data?.unsignedPermit,
      swapQuote,
      isSwapLoading: false,
      isRevokeNeeded,
      swapRequestParams: data?.swapRequestParams ?? undefined,
    })

    return swapTxInfo
  }

  return getEVMSwapTransactionRequestInfo
}
