import { getSpryConfig } from '@spry/config'
import { PoolTier } from '@spry/fee'
import {
  createSpryQuoterClient,
  createSpryStateViewClient,
  poolId,
  spryPoolKey,
  type Address,
  type SimulateQuoteFn,
  type StateViewReadFn,
} from '@spry/sdk'
import {
  type ClassicQuoteResponse,
  type DiscriminatedQuoteResponse,
  type UnwrapQuoteResponse,
  type WrapQuoteResponse,
  TradingApi,
} from '@universe/api'
import { SPRY_TEST_TOKEN_A, SPRY_TEST_TOKEN_B } from 'uniswap/src/constants/tokens'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import type { ValidatedTradeInput } from 'uniswap/src/features/transactions/swap/services/tradeService/transformations/buildQuoteRequest'
import { getWrapType } from 'uniswap/src/features/transactions/swap/utils/wrap'
import { WrapType } from 'uniswap/src/features/transactions/types/wrap'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

/**
 * The Uniswap entry-gateway / Trading API does not serve Base Sepolia: every quote
 * request returns 401. For the Spry deployment we therefore synthesize quote
 * responses locally and feed them through the normal `transformQuoteToTrade`
 * pipeline, so the resulting trade objects are identical to real API responses.
 *
 * Two cases are handled:
 *  - Wrap/unwrap (native ETH <-> WETH): deterministic 1:1, no chain reads.
 *  - The Spry pool (sptA/sptB): priced on-chain via the V4 Quoter (authoritative,
 *    reflects the SpryHook dynamic fee) + StateView for pool state.
 *
 * Returns null for anything else, so the caller falls through to "no trade".
 */
export async function buildSpryLocalQuote(
  validatedInput: ValidatedTradeInput,
): Promise<DiscriminatedQuoteResponse | null> {
  const wrapQuote = buildSpryWrapQuote(validatedInput)
  if (wrapQuote) {
    return wrapQuote
  }
  return buildSprySwapQuote(validatedInput)
}

/**
 * Wrap/unwrap (native ETH <-> WETH) is deterministic 1:1 and needs no chain reads,
 * so the response is built purely from the validated input. Returns null for any
 * non-wrap pair.
 */
export function buildSpryWrapQuote(validatedInput: ValidatedTradeInput): DiscriminatedQuoteResponse | null {
  // Scope strictly to Base Sepolia; every other chain keeps the real Trading API path.
  if (validatedInput.currencyIn.chainId !== UniverseChainId.BaseSepolia) {
    return null
  }

  const wrapType = getWrapType(validatedInput.currencyIn, validatedInput.currencyOut)
  if (wrapType === WrapType.NotApplicable) {
    return null
  }

  // Wrap/unwrap is strictly 1:1, so the input and output raw amounts are identical
  // regardless of exact-input vs exact-output. WrapTrade only reads these amounts.
  const amountRaw = validatedInput.amount.quotient.toString()
  const quote = {
    input: { amount: amountRaw },
    output: { amount: amountRaw },
  }

  if (wrapType === WrapType.Wrap) {
    const response: WrapQuoteResponse = {
      requestId: 'spry-local-wrap',
      routing: TradingApi.Routing.WRAP,
      permitData: null,
      quote,
    }
    return response
  }

  const response: UnwrapQuoteResponse = {
    requestId: 'spry-local-unwrap',
    routing: TradingApi.Routing.UNWRAP,
    permitData: null,
    quote,
  }
  return response
}

// Base Sepolia is the only chain with a deployed Spry pool. Direct RPC (the
// Uniswap gateway proxy 401s here); CSP already allows *.base.org.
const BASE_SEPOLIA_RPC_URL = 'https://sepolia.base.org'
// The Trading API chain-id enum member for Base Sepolia (84532).
const BASE_SEPOLIA_API_CHAIN_ID = TradingApi.ChainId._84532
// The only deployed Spry pool is sptA/sptB at the BLUE_CHIP tier.
const SPRY_POOL_TIER = PoolTier.BLUE_CHIP

// One shared read-only client. createPublicClient does no I/O (connections open
// lazily on the first call), so building it at module load is cheap.
const spryPublicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) })

// The set of Spry-pool token addresses (cache-normalized) for sptA/sptB pair detection.
const SPRY_POOL_TOKENS = new Set([
  normalizeTokenAddressForCache(SPRY_TEST_TOKEN_A.address),
  normalizeTokenAddressForCache(SPRY_TEST_TOKEN_B.address),
])

function isSpryPoolPair(tokenInAddress: string, tokenOutAddress: string): boolean {
  const tokenIn = normalizeTokenAddressForCache(tokenInAddress)
  const tokenOut = normalizeTokenAddressForCache(tokenOutAddress)
  return tokenIn !== tokenOut && SPRY_POOL_TOKENS.has(tokenIn) && SPRY_POOL_TOKENS.has(tokenOut)
}

/**
 * Prices the Spry sptA/sptB pool on Base Sepolia via the V4 Quoter (the
 * authoritative source: it runs the swap through the SpryHook so the output
 * reflects the dynamic fee) plus a StateView read for pool state. Produces a
 * CLASSIC quote response with a single V4 route, which the normal
 * transformQuoteToTrade pipeline turns into a ClassicTrade whose input/output
 * amounts come straight from the Quoter. Returns null for any non-Spry-pool pair.
 */
export async function buildSprySwapQuote(
  validatedInput: ValidatedTradeInput,
): Promise<DiscriminatedQuoteResponse | null> {
  const { currencyIn, currencyOut } = validatedInput

  if (currencyIn.chainId !== UniverseChainId.BaseSepolia) {
    return null
  }
  // The Spry pool is sptA/sptB, both ERC20s. Native legs have no Spry pool.
  if (currencyIn.isNative || currencyOut.isNative) {
    return null
  }
  const tokenInAddress = currencyIn.wrapped.address
  const tokenOutAddress = currencyOut.wrapped.address
  if (!isSpryPoolPair(tokenInAddress, tokenOutAddress)) {
    return null
  }

  const config = getSpryConfig(UniverseChainId.BaseSepolia)
  if (!config) {
    return null
  }

  const poolKey = spryPoolKey({
    tokenA: tokenInAddress as Address,
    tokenB: tokenOutAddress as Address,
    tier: SPRY_POOL_TIER,
    hookAddress: config.addresses.spryHook,
  })
  const id = poolId(poolKey)

  const simulate: SimulateQuoteFn = async (request) =>
    (await spryPublicClient.simulateContract(request as never)).result as readonly [bigint, bigint]
  const read: StateViewReadFn = (request) => spryPublicClient.readContract(request as never) as Promise<unknown>
  const quoter = createSpryQuoterClient(simulate, config.addresses.quoter)
  const stateView = createSpryStateViewClient(read, config.addresses.stateView)

  const zeroForOne = areAddressesEqual({
    addressInput1: { address: tokenInAddress, platform: Platform.EVM },
    addressInput2: { address: poolKey.currency0, platform: Platform.EVM },
  })
  const exactAmount = BigInt(validatedInput.amount.quotient.toString())
  const isExactIn = validatedInput.requestTradeType === TradingApi.TradeType.EXACT_INPUT

  // Kick off the pool-state reads in parallel with the quote.
  const slot0Promise = stateView.getSlot0(id)
  const liquidityPromise = stateView.getLiquidity(id)

  let amountIn: bigint
  let amountOut: bigint
  if (isExactIn) {
    const { amountOut: quotedOut } = await quoter.quoteExactInputSingle({ poolKey, zeroForOne, exactAmount })
    amountIn = exactAmount
    amountOut = quotedOut
  } else {
    const { amountIn: quotedIn } = await quoter.quoteExactOutputSingle({ poolKey, zeroForOne, exactAmount })
    amountIn = quotedIn
    amountOut = exactAmount
  }

  const slot0 = await slot0Promise
  const liquidity = await liquidityPromise

  const tokenIn = {
    address: tokenInAddress,
    chainId: BASE_SEPOLIA_API_CHAIN_ID,
    decimals: String(currencyIn.decimals),
    symbol: currencyIn.symbol,
  }
  const tokenOut = {
    address: tokenOutAddress,
    chainId: BASE_SEPOLIA_API_CHAIN_ID,
    decimals: String(currencyOut.decimals),
    symbol: currencyOut.symbol,
  }

  const v4Pool: TradingApi.V4PoolInRoute = {
    type: 'v4-pool',
    address: id,
    tokenIn,
    tokenOut,
    sqrtRatioX96: slot0.sqrtPriceX96.toString(),
    liquidity: liquidity.toString(),
    tickCurrent: slot0.tick.toString(),
    // Dynamic-fee flag (0x800000); the v4-sdk Pool accepts it for hooked pools.
    fee: String(poolKey.fee),
    tickSpacing: poolKey.tickSpacing,
    hooks: poolKey.hooks,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
  }

  const response: ClassicQuoteResponse = {
    // Vary the id per quote so downstream new-quote detection (isNewQuote) and
    // error logging key off each distinct price, not a single constant.
    requestId: `spry-local-swap-${amountIn.toString()}-${amountOut.toString()}`,
    routing: TradingApi.Routing.CLASSIC,
    permitData: null,
    quote: {
      input: { amount: amountIn.toString(), token: tokenInAddress },
      output: { amount: amountOut.toString(), token: tokenOutAddress },
      chainId: BASE_SEPOLIA_API_CHAIN_ID,
      tradeType: validatedInput.requestTradeType,
      route: [[v4Pool]],
    },
  }
  return response
}
