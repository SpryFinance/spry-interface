import { getSpryConfig, isSpryChain } from '@spry/config'
import { type Address } from '@spry/sdk'
import { useQuery } from '@tanstack/react-query'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'
import { TradingApi } from '@universe/api'
import { useMemo } from 'react'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { ApprovalTxInfo } from 'uniswap/src/features/transactions/swap/review/hooks/useTokenApprovalInfo'
import { getSpryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { estimateSpryGasFeeValue } from 'uniswap/src/features/transactions/swap/services/tradeService/sprySwapTransaction'
import { ApprovalAction } from 'uniswap/src/features/transactions/swap/types/trade'
import { WrapType } from 'uniswap/src/features/transactions/types/wrap'
import { ONE_SECOND_MS } from 'utilities/src/time/time'
import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem'

// Generous fixed limit for an erc20 approve (used for the rough fee estimate).
const SPRY_APPROVAL_GAS_LIMIT = BigInt(60_000)

const ZERO_GAS_FEE = { value: '0', displayValue: '0', isLoading: false, error: null } as const
const LOADING_GAS_FEE = { value: undefined, displayValue: undefined, isLoading: true, error: null } as const

const NO_APPROVAL: ApprovalTxInfo = {
  tokenApprovalInfo: { action: ApprovalAction.None, txRequest: null, cancelTxRequest: null },
  approvalGasFeeResult: ZERO_GAS_FEE,
  revokeGasFeeResult: ZERO_GAS_FEE,
}

/**
 * Local ERC20-allowance check + approval builder for Spry pool swaps on Base
 * Sepolia. The Trading API /approval endpoint 401s here, which otherwise leaves
 * the approval action Unknown and poisons the merged gas result (showing "This
 * swap may fail"). We instead read the input token's allowance to the SpryRouter
 * directly and, if insufficient, build a plain erc20 approve.
 *
 * Returns null for anything this path does not handle (other chains, non-classic
 * routing, wraps, native input, or unconnected) so the caller keeps the gateway
 * approval flow unchanged.
 */
export function useSprySwapApprovalInfo(params: {
  chainId: UniverseChainId
  address?: string
  currencyInAmount: Maybe<CurrencyAmount<Currency>>
  /**
   * The slippage-adjusted maximum input (trade.maxAmountIn) - the most the swap can
   * actually pull. Preferred for the allowance check so exact-output swaps (whose
   * realized input exceeds the quote) are not under-approved.
   */
  currencyInMaxAmount: Maybe<CurrencyAmount<Currency>>
  routing: TradingApi.Routing | undefined
  wrapType: WrapType
}): ApprovalTxInfo | null {
  const { chainId, address, currencyInAmount, currencyInMaxAmount, routing, wrapType } = params

  const config = getSpryConfig(chainId)
  const spender = config?.addresses.spryRouter
  const currencyIn = currencyInAmount?.currency
  const token = currencyIn && !currencyIn.isNative ? currencyIn.wrapped.address : undefined
  // Cover the max the swap can spend (maxAmountIn >= the quoted input), not just the quote.
  const requiredCurrencyAmount = currencyInMaxAmount ?? currencyInAmount
  const requiredAmount = requiredCurrencyAmount ? BigInt(requiredCurrencyAmount.quotient.toString()) : BigInt(0)

  // A Spry classic swap on a Spry chain by a connected account. A native ETH input
  // needs no approval; an ERC20 input needs the allowance check below (token set).
  const isSpryClassicSwap =
    isSpryChain(chainId) &&
    routing === TradingApi.Routing.CLASSIC &&
    wrapType === WrapType.NotApplicable &&
    Boolean(address) &&
    Boolean(spender)
  const nativeInput = Boolean(currencyIn?.isNative)
  const applies = isSpryClassicSwap && Boolean(token)

  const { data, isLoading } = useQuery({
    queryKey: ['sprySwapAllowance', chainId, token, address, spender],
    queryFn: async () => {
      const [allowance, approvalGasFeeValue] = await Promise.all([
        getSpryPublicClient(chainId).readContract({
          address: token as Address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as Address, spender as Address],
        }),
        estimateSpryGasFeeValue(chainId, SPRY_APPROVAL_GAS_LIMIT),
      ])
      return { allowance, approvalGasFeeValue }
    },
    enabled: applies,
    staleTime: 12 * ONE_SECOND_MS,
  })

  return useMemo(() => {
    // Native ETH input needs no ERC20 approval; short-circuit so we don't fall
    // through to the Spry-chain 401 gateway approval (which shows "may fail").
    if (isSpryClassicSwap && nativeInput) {
      return NO_APPROVAL
    }
    if (!applies || !token || !spender) {
      return null
    }

    // Allowance still loading: report pending (no error, so no "may fail").
    if (isLoading || !data) {
      return {
        tokenApprovalInfo: { action: ApprovalAction.None, txRequest: null, cancelTxRequest: null },
        approvalGasFeeResult: LOADING_GAS_FEE,
        revokeGasFeeResult: LOADING_GAS_FEE,
      }
    }

    if (data.allowance >= requiredAmount) {
      return NO_APPROVAL
    }

    // Approve the SpryRouter to spend the input token (max, so repeat swaps skip
    // re-approval). Gas is a rough estimate; the wallet re-estimates at signing.
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender as Address, maxUint256],
    })
    return {
      tokenApprovalInfo: {
        action: ApprovalAction.Permit2Approve,
        txRequest: { to: token, data: approveData, value: '0x0', chainId },
        cancelTxRequest: null,
      },
      approvalGasFeeResult: {
        value: data.approvalGasFeeValue,
        displayValue: data.approvalGasFeeValue,
        isLoading: false,
        error: null,
      },
      revokeGasFeeResult: ZERO_GAS_FEE,
    }
  }, [applies, isSpryClassicSwap, nativeInput, token, spender, isLoading, data, requiredAmount, chainId])
}
