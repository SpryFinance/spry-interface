import { getSpryConfig } from '@spry/config'
import { PoolTier } from '@spry/fee'
import { buildSwapExactInputSingle, buildSwapExactOutputSingle, spryPoolKey, type Address } from '@spry/sdk'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

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
