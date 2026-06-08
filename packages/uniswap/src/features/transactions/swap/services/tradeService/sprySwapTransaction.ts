import { getSpryConfig } from '@spry/config'
import {
  buildSwapExactInput,
  buildSwapExactInputSingle,
  buildSwapExactOutput,
  buildSwapExactOutputSingle,
  isNativeCurrency,
  type Address,
  type Hex,
  type PathKey,
  type SpryTxRequest,
} from '@spry/sdk'
import { TradeType } from '@uniswap/sdk-core'
import { TradingApi } from '@universe/api'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { TransactionRequestInfo } from 'uniswap/src/features/transactions/swap/review/services/swapTxAndGasInfoService/utils'
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import {
  spryHopsFromRoute,
  type SpryHop,
} from 'uniswap/src/features/transactions/swap/services/tradeService/spryRouting'
import type { ClassicTrade } from 'uniswap/src/features/transactions/swap/types/trade'

// 1 gwei fallback if the live gas price read fails.
const GAS_PRICE_FALLBACK = BigInt(1_000_000_000)
// Realistic fixed limit for a SpryRouter swap through the hook, sized to cover a
// 2-hop route. A live estimateGas reverts before the token approval, so the review
// uses this estimate and the wallet computes the exact gas at signing (Base Sepolia
// fees are ~$0).
const SPRY_SWAP_GAS_LIMIT = BigInt(500_000)

const EMPTY_HOOK_DATA: Hex = '0x'

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
  data: Hex
  value: bigint
  chainId: number
}

/**
 * Builds the SpryRouter calldata for a priced Spry route. The Trading API gateway's
 * /swap endpoint does not serve Base Sepolia, so we encode the call locally via the
 * @spry/sdk router builders (which enforce the section 6.1 guards and are round-trip
 * tested). A 1-hop route uses the single-pool entry points (which attach native ETH
 * automatically); a multi-hop route uses the path entry points. The route is the
 * exact one the quote chose (read back from the trade), so execution matches the
 * quoted price. Allowance-based: an ERC20 input must already be approved to the
 * SpryRouter (handled by the approval flow); a native ETH input attaches its value.
 *
 * Amounts come from the priced trade: the exact side is the user's input, and the
 * bound (amountOutMin / amountInMax) is the trade's slippage-adjusted limit. Returns
 * null for non-Spry chains or an empty route.
 */
export function buildSprySwapTxRequest(args: {
  chainId: number
  /** The priced route hops, in input -> output order. */
  route: SpryHop[]
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

  const firstHop = args.route[0]
  const lastHop = args.route[args.route.length - 1]
  if (!firstHop || !lastHop) {
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

  const router = config.addresses.spryRouter

  let tx: SpryTxRequest
  if (args.route.length === 1) {
    // Single-pool entry points attach native ETH automatically (value = amountIn
    // when the pulled currency is native).
    tx = args.exactInput
      ? buildSwapExactInputSingle({
          router,
          key: firstHop.poolKey,
          zeroForOne: firstHop.zeroForOne,
          amountIn: args.amountIn,
          amountOutMin: args.amountOutMin,
          recipient: args.recipient,
          deadline: args.deadline,
        })
      : buildSwapExactOutputSingle({
          router,
          key: firstHop.poolKey,
          zeroForOne: firstHop.zeroForOne,
          amountOut: args.amountOut,
          amountInMax: args.amountInMax,
          recipient: args.recipient,
          deadline: args.deadline,
        })
  } else if (args.exactInput) {
    // Forward path: each hop's intermediateCurrency is its output currency.
    const path: PathKey[] = args.route.map((hop) => ({
      intermediateCurrency: hop.currencyOut,
      fee: hop.poolKey.fee,
      tickSpacing: hop.poolKey.tickSpacing,
      hooks: hop.poolKey.hooks,
      hookData: EMPTY_HOOK_DATA,
    }))
    tx = buildSwapExactInput({
      router,
      currencyIn: firstHop.currencyIn,
      path,
      amountIn: args.amountIn,
      amountOutMin: args.amountOutMin,
      recipient: args.recipient,
      deadline: args.deadline,
    })
  } else {
    // Exact-output path is FORWARD: SpryRouter.swapExactOutput expects
    // path[0].intermediateCurrency to be the user's input side (for A -> B -> C
    // with currencyOut = C, path = [{A}, {B}]); the router walks it backward
    // internally. Each hop's intermediateCurrency is its from-side currency.
    const path: PathKey[] = args.route.map((hop) => ({
      intermediateCurrency: hop.currencyIn,
      fee: hop.poolKey.fee,
      tickSpacing: hop.poolKey.tickSpacing,
      hooks: hop.poolKey.hooks,
      hookData: EMPTY_HOOK_DATA,
    }))
    tx = buildSwapExactOutput({
      router,
      currencyOut: lastHop.currencyOut,
      path,
      amountOut: args.amountOut,
      amountInMax: args.amountInMax,
      recipient: args.recipient,
      deadline: args.deadline,
      // The reversed path hides the input currency, so flag a native ETH input.
      inputIsNative: isNativeCurrency(firstHop.currencyIn),
    })
  }

  return { to: tx.to, data: tx.data, value: tx.value, chainId: args.chainId }
}

/**
 * Builds the swap-transaction info for a priced Spry ClassicTrade on Base Sepolia,
 * in the shape the swap-tx service expects (replacing the Trading API /swap call,
 * which does not serve this chain). Replays the exact route the quote chose, read
 * back from the trade's V4 route, then encodes the SpryRouter calldata.
 *
 * Gas is a rough estimate (fixed limit * live price): a live estimateGas would
 * revert before the token approval step, so the review uses this to enable
 * submission and the wallet re-estimates the real gas at signing. Returns null if
 * this is not a Base Sepolia Spry swap.
 */
export async function buildSprySwapTransactionInfo(args: {
  trade: ClassicTrade
  account: string
  /** SPRY: settings-derived deadline (unix seconds). Falls back to the trade's own
   * placeholder deadline when the caller has not resolved the swap settings. */
  deadline?: number
}): Promise<TransactionRequestInfo | null> {
  const { trade, account, deadline } = args
  const chainId = trade.inputAmount.currency.chainId
  if (chainId !== UniverseChainId.BaseSepolia) {
    return null
  }

  // Replay the exact route the quote chose, read back from the trade (never
  // re-derive it, or a later-block "best route" could diverge from the quote).
  const firstRoute = trade.quote.quote.route?.[0]
  const v4Pools = firstRoute?.filter((pool): pool is TradingApi.V4PoolInRoute => pool.type === 'v4-pool') ?? []
  const route = spryHopsFromRoute(v4Pools)
  if (!route) {
    return null
  }

  const swapTx = buildSprySwapTxRequest({
    chainId,
    route,
    exactInput: trade.tradeType === TradeType.EXACT_INPUT,
    amountIn: BigInt(trade.inputAmount.quotient.toString()),
    amountOut: BigInt(trade.outputAmount.quotient.toString()),
    amountOutMin: BigInt(trade.minAmountOut.quotient.toString()),
    amountInMax: BigInt(trade.maxAmountIn.quotient.toString()),
    recipient: account as Address,
    deadline: BigInt(deadline ?? trade.deadline),
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
