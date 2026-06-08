import { getSpryConfig } from '@spry/config'
import { PoolTier } from '@spry/fee'
import { buildSwapExactInputSingle, buildSwapExactOutputSingle, spryPoolKey, type Address } from '@spry/sdk'
import { TradeType } from '@uniswap/sdk-core'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import type { TransactionRequestInfo } from 'uniswap/src/features/transactions/swap/review/services/swapTxAndGasInfoService/utils'
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import type { ClassicTrade } from 'uniswap/src/features/transactions/swap/types/trade'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

// 1 gwei fallback if the live gas price read fails.
const GAS_PRICE_FALLBACK = BigInt(1_000_000_000)
// Generous fixed limit for a SpryRouter single-hop swap (estimateGas reverts
// before the token approval, so we cannot probe it live here).
const SPRY_SWAP_GAS_LIMIT = BigInt(500_000)

/**
 * A rough gas fee (wei) = gasLimit * live gas price, with a price fallback. The
 * review screen requires a defined gas-fee value to enable submission; the wallet
 * re-estimates the real gas at signing time.
 */
export async function estimateSpryGasFeeValue(gasLimit: bigint): Promise<string> {
  let gasPrice: bigint
  try {
    gasPrice = await spryPublicClient.getGasPrice()
  } catch {
    gasPrice = GAS_PRICE_FALLBACK
  }
  return (gasLimit * gasPrice).toString()
}

/** A ready-to-send Spry swap transaction (SpryRouter call). */
export interface SprySwapTxRequest {
  to: Address
  data: `0x${string}`
  value: bigint
  chainId: number
}

/**
 * Builds the SpryRouter calldata for a Spry pool swap. The Trading API gateway's
 * /swap endpoint does not serve Base Sepolia, so we encode the call locally via
 * the @spry/sdk router builders (which enforce the section 6.1 guards and are
 * round-trip tested). Allowance-based entry points: the ERC20 input must already
 * be approved to the SpryRouter (handled by the approval flow).
 *
 * Amounts come from the already-priced trade: the exact side is the user's input,
 * and the bound (amountOutMin / amountInMax) is the trade's slippage-adjusted
 * limit. Returns null for non-Spry chains.
 */
export function buildSprySwapTxRequest(args: {
  chainId: number
  tokenInAddress: Address
  tokenOutAddress: Address
  /** true for EXACT_INPUT, false for EXACT_OUTPUT. */
  exactInput: boolean
  /** Raw exact-input amount (used when exactInput). */
  amountIn: bigint
  /** Raw exact-output amount (used when !exactInput). */
  amountOut: bigint
  /** Raw slippage-adjusted minimum output (used when exactInput). */
  amountOutMin: bigint
  /** Raw slippage-adjusted maximum input (used when !exactInput). */
  amountInMax: bigint
  recipient: Address
  /** Unix-seconds deadline. */
  deadline: bigint
}): SprySwapTxRequest | null {
  if (args.chainId !== UniverseChainId.BaseSepolia) {
    return null
  }

  const config = getSpryConfig(args.chainId)
  if (!config) {
    return null
  }

  // Defense-in-depth for a funds-moving call: never send output to the zero
  // address, and require a positive slippage bound so a wiring mistake cannot
  // submit an unprotected swap. The bound itself is the trade's slippage limit.
  if (BigInt(args.recipient) === BigInt(0)) {
    throw new Error('buildSprySwapTxRequest: recipient must not be the zero address')
  }
  if (args.exactInput && args.amountOutMin <= BigInt(0)) {
    throw new Error('buildSprySwapTxRequest: amountOutMin must be positive for slippage protection')
  }
  if (!args.exactInput && args.amountInMax <= BigInt(0)) {
    throw new Error('buildSprySwapTxRequest: amountInMax must be positive')
  }

  const poolKey = spryPoolKey({
    tokenA: args.tokenInAddress,
    tokenB: args.tokenOutAddress,
    tier: PoolTier.BLUE_CHIP,
    hookAddress: config.addresses.spryHook,
  })

  const zeroForOne = areAddressesEqual({
    addressInput1: { address: args.tokenInAddress, platform: Platform.EVM },
    addressInput2: { address: poolKey.currency0, platform: Platform.EVM },
  })

  const router = config.addresses.spryRouter

  const tx = args.exactInput
    ? buildSwapExactInputSingle({
        router,
        key: poolKey,
        zeroForOne,
        amountIn: args.amountIn,
        amountOutMin: args.amountOutMin,
        recipient: args.recipient,
        deadline: args.deadline,
      })
    : buildSwapExactOutputSingle({
        router,
        key: poolKey,
        zeroForOne,
        amountOut: args.amountOut,
        amountInMax: args.amountInMax,
        recipient: args.recipient,
        deadline: args.deadline,
      })

  return { to: tx.to, data: tx.data, value: tx.value, chainId: args.chainId }
}

/**
 * Builds the swap-transaction info for a priced Spry ClassicTrade on Base Sepolia,
 * in the shape the swap-tx service expects (replacing the Trading API /swap call,
 * which does not serve this chain). Extracts the pool direction and the
 * slippage-adjusted bounds from the trade, encodes the SpryRouter calldata, and
 * returns a single populated txRequest.
 *
 * Gas is a rough estimate (fixed limit * live price): a live estimateGas would
 * revert before the token approval step, so the review uses this to enable
 * submission and the wallet re-estimates the real gas at signing. Returns null if
 * this is not a Base Sepolia Spry swap.
 */
export async function buildSprySwapTransactionInfo(args: {
  trade: ClassicTrade
  account: string
}): Promise<TransactionRequestInfo | null> {
  const { trade, account } = args
  const chainId = trade.inputAmount.currency.chainId
  if (chainId !== UniverseChainId.BaseSepolia) {
    return null
  }

  const swapTx = buildSprySwapTxRequest({
    chainId,
    tokenInAddress: trade.inputAmount.currency.wrapped.address as Address,
    tokenOutAddress: trade.outputAmount.currency.wrapped.address as Address,
    exactInput: trade.tradeType === TradeType.EXACT_INPUT,
    amountIn: BigInt(trade.inputAmount.quotient.toString()),
    amountOut: BigInt(trade.outputAmount.quotient.toString()),
    amountOutMin: BigInt(trade.minAmountOut.quotient.toString()),
    amountInMax: BigInt(trade.maxAmountIn.quotient.toString()),
    recipient: account as Address,
    deadline: BigInt(trade.deadline),
  })
  if (!swapTx) {
    return null
  }

  const txRequest = {
    to: swapTx.to,
    data: swapTx.data,
    value: `0x${swapTx.value.toString(16)}`,
    chainId,
  }

  const gasFeeValue = await estimateSpryGasFeeValue(SPRY_SWAP_GAS_LIMIT)

  return {
    txRequests: [txRequest],
    gasFeeResult: { value: gasFeeValue, displayValue: gasFeeValue, isLoading: false, error: null },
    gasEstimate: {},
    swapRequestArgs: undefined,
  }
}
