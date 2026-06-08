import { TradingApi } from '@universe/api'
import { WRAPPED_NATIVE_CURRENCY } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { TransactionRequestInfo } from 'uniswap/src/features/transactions/swap/review/services/swapTxAndGasInfoService/utils'
import { estimateSpryGasFeeValue } from 'uniswap/src/features/transactions/swap/services/tradeService/sprySwapTransaction'
import type { UnwrapTrade, WrapTrade } from 'uniswap/src/features/transactions/swap/types/trade'
import { encodeFunctionData } from 'viem'

// Minimal WETH9 interface: wrap = deposit() payable, unwrap = withdraw(uint256).
const WETH_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
] as const

// A wrap/unwrap is a single cheap WETH call; generous fixed limit for the rough fee.
const SPRY_WRAP_GAS_LIMIT = BigInt(60_000)

/**
 * Builds the wrap/unwrap transaction info for a Base Sepolia WrapTrade/UnwrapTrade,
 * in the shape the swap-tx service expects (replacing the Trading API /swap call,
 * which does not serve this chain). Wrap (native ETH -> WETH) is WETH.deposit() with
 * the ETH as value; unwrap (WETH -> native ETH) is WETH.withdraw(amount). Both are
 * 1:1, so the amount is just the trade's input amount. Returns null off Base Sepolia.
 */
export async function buildSpryWrapTransactionInfo(args: {
  trade: WrapTrade | UnwrapTrade
}): Promise<TransactionRequestInfo | null> {
  const { trade } = args
  const chainId = trade.inputAmount.currency.chainId
  if (chainId !== UniverseChainId.BaseSepolia) {
    return null
  }

  const weth = WRAPPED_NATIVE_CURRENCY[chainId]?.address
  if (!weth) {
    return null
  }

  const amount = BigInt(trade.inputAmount.quotient.toString())
  const isWrap = trade.routing === TradingApi.Routing.WRAP

  const data = isWrap
    ? encodeFunctionData({ abi: WETH_ABI, functionName: 'deposit', args: [] })
    : encodeFunctionData({ abi: WETH_ABI, functionName: 'withdraw', args: [amount] })

  const txRequest = {
    to: weth,
    data,
    // Wrapping sends the native ETH as msg.value; unwrapping sends none.
    value: isWrap ? `0x${amount.toString(16)}` : '0x0',
    chainId,
  }

  const gasFeeValue = await estimateSpryGasFeeValue(SPRY_WRAP_GAS_LIMIT)

  return {
    txRequests: [txRequest],
    gasFeeResult: { value: gasFeeValue, displayValue: gasFeeValue, isLoading: false, error: null },
    gasEstimate: {},
    swapRequestArgs: undefined,
  }
}
