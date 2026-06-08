import { getSpryConfig } from '@spry/config'
import {
  createSpryQuoterClient,
  createSpryStateViewClient,
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
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import {
  findSpryCurrency,
  findSpryRoute,
  getSpryPoolGraph,
  toPoolCurrency,
  type SpryHop,
  type SpryPoolCurrency,
} from 'uniswap/src/features/transactions/swap/services/tradeService/spryRouting'
import type { ValidatedTradeInput } from 'uniswap/src/features/transactions/swap/services/tradeService/transformations/buildQuoteRequest'
import { getWrapType } from 'uniswap/src/features/transactions/swap/utils/wrap'
import { WrapType } from 'uniswap/src/features/transactions/types/wrap'
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
 *  - Spry pool swaps (ETH/sptA/sptB): priced on-chain via the V4 Quoter
 *    (authoritative, reflects the SpryHook dynamic fee) + StateView for pool
 *    state. Routes of 1 or 2 hops are found locally (see spryRouting).
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

// Base Sepolia is the only chain with deployed Spry pools. Direct RPC (the Uniswap
// gateway proxy 401s here); CSP already allows *.base.org.
const BASE_SEPOLIA_RPC_URL = 'https://sepolia.base.org'
// The Trading API chain-id enum member for Base Sepolia (84532).
const BASE_SEPOLIA_API_CHAIN_ID = TradingApi.ChainId._84532

// One shared read-only client. createPublicClient does no I/O (connections open
// lazily on the first call), so building it at module load is cheap. Exported so
// the swap-tx and approval paths reuse the same client.
export const spryPublicClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) })

/** One hop priced by the Quoter: the hop plus its input/output amounts. */
interface QuotedHop {
  hop: SpryHop
  amountIn: bigint
  amountOut: bigint
}

/** A V4 route token in the shape parseV4PoolApi expects (native ETH uses the zero address). */
function routeToken(currency: SpryPoolCurrency): TradingApi.TokenInRoute {
  return {
    address: currency.address,
    chainId: BASE_SEPOLIA_API_CHAIN_ID,
    decimals: String(currency.decimals),
    symbol: currency.symbol,
  }
}

/**
 * Prices a Spry pool swap on Base Sepolia. Finds the route (1 hop for a direct pool,
 * 2 hops through sptA for ETH<->sptB), prices each hop on-chain via the V4 Quoter
 * (authoritative: runs the swap through the SpryHook so the output reflects the
 * dynamic fee), and reads each pool's state from StateView. Produces a CLASSIC quote
 * with a single V4 route of N pools, which transformQuoteToTrade turns into a
 * ClassicTrade whose input/output amounts come straight from the Quoter. Returns
 * null for any pair with no Spry route.
 */
export async function buildSprySwapQuote(
  validatedInput: ValidatedTradeInput,
): Promise<DiscriminatedQuoteResponse | null> {
  const { currencyIn, currencyOut } = validatedInput

  if (currencyIn.chainId !== UniverseChainId.BaseSepolia) {
    return null
  }

  const graph = getSpryPoolGraph(UniverseChainId.BaseSepolia)
  if (!graph) {
    return null
  }
  const config = getSpryConfig(UniverseChainId.BaseSepolia)
  if (!config) {
    return null
  }

  const fromCurrency = toPoolCurrency(currencyIn)
  const toCurrency = toPoolCurrency(currencyOut)
  const route = findSpryRoute({ pools: graph.pools, from: fromCurrency, to: toCurrency })
  if (!route) {
    return null
  }

  const simulate: SimulateQuoteFn = async (request) =>
    (await spryPublicClient.simulateContract(request as never)).result as readonly [bigint, bigint]
  const read: StateViewReadFn = (request) => spryPublicClient.readContract(request as never) as Promise<unknown>
  const quoter = createSpryQuoterClient(simulate, config.addresses.quoter)
  const stateView = createSpryStateViewClient(read, config.addresses.stateView)

  const isExactIn = validatedInput.requestTradeType === TradingApi.TradeType.EXACT_INPUT
  const exactAmount = BigInt(validatedInput.amount.quotient.toString())

  // Price each hop in sequence, exactly as the router executes the path. For
  // exact-in the amount flows forward; for exact-out we size each hop's required
  // input walking backward, then restore forward order.
  const quoted: QuotedHop[] = []
  if (isExactIn) {
    let amount = exactAmount
    for (const hop of route) {
      const { amountOut } = await quoter.quoteExactInputSingle({
        poolKey: hop.poolKey,
        zeroForOne: hop.zeroForOne,
        exactAmount: amount,
      })
      quoted.push({ hop, amountIn: amount, amountOut })
      amount = amountOut
    }
  } else {
    const backward: QuotedHop[] = []
    let amount = exactAmount
    for (const hop of [...route].reverse()) {
      const { amountIn } = await quoter.quoteExactOutputSingle({
        poolKey: hop.poolKey,
        zeroForOne: hop.zeroForOne,
        exactAmount: amount,
      })
      backward.push({ hop, amountIn, amountOut: amount })
      amount = amountIn
    }
    backward.reverse()
    quoted.push(...backward)
  }

  const first = quoted[0]
  const last = quoted[quoted.length - 1]
  if (!first || !last) {
    return null
  }
  const totalAmountIn = first.amountIn
  const totalAmountOut = last.amountOut

  // Per-pool state. sqrtPriceX96 and tick come from the same slot0 read so the
  // v4-sdk Pool's PRICE_BOUNDS invariant holds.
  const states = await Promise.all(
    quoted.map(async ({ hop }) => {
      const [slot0, liquidity] = await Promise.all([stateView.getSlot0(hop.poolId), stateView.getLiquidity(hop.poolId)])
      return { slot0, liquidity }
    }),
  )

  const v4Pools: TradingApi.V4PoolInRoute[] = quoted.map(({ hop, amountIn, amountOut }, index) => {
    const state = states[index]
    const tokenIn = findSpryCurrency(graph, hop.currencyIn)
    const tokenOut = findSpryCurrency(graph, hop.currencyOut)
    if (!state || !tokenIn || !tokenOut) {
      throw new Error('Spry route hop is missing pool state or currency metadata')
    }
    return {
      type: 'v4-pool',
      address: hop.poolId,
      tokenIn: routeToken(tokenIn),
      tokenOut: routeToken(tokenOut),
      sqrtRatioX96: state.slot0.sqrtPriceX96.toString(),
      liquidity: state.liquidity.toString(),
      tickCurrent: state.slot0.tick.toString(),
      // Dynamic-fee flag (0x800000); the v4-sdk Pool accepts it for hooked pools.
      fee: String(hop.poolKey.fee),
      tickSpacing: hop.poolKey.tickSpacing,
      hooks: hop.poolKey.hooks,
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
    }
  })

  const response: ClassicQuoteResponse = {
    // Vary the id per quote so downstream new-quote detection (isNewQuote) and
    // error logging key off each distinct price, not a single constant.
    requestId: `spry-local-swap-${totalAmountIn.toString()}-${totalAmountOut.toString()}`,
    routing: TradingApi.Routing.CLASSIC,
    permitData: null,
    quote: {
      input: { amount: totalAmountIn.toString(), token: fromCurrency },
      output: { amount: totalAmountOut.toString(), token: toCurrency },
      chainId: BASE_SEPOLIA_API_CHAIN_ID,
      tradeType: validatedInput.requestTradeType,
      route: [v4Pools],
    },
  }
  return response
}
