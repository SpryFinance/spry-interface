import { getSpryConfig, getSpryRpcUrl, isSpryChain } from '@spry/config'
import {
  createSpryQuoterClient,
  createSpryStateViewClient,
  type SimulateQuoteFn,
  type SpryQuoterClient,
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
  discoverSpryPoolGraph,
  findSpryCurrency,
  findSpryRoutes,
  toPoolCurrency,
  type SpryHop,
  type SpryPoolCurrency,
} from 'uniswap/src/features/transactions/swap/services/tradeService/spryRouting'
import type { ValidatedTradeInput } from 'uniswap/src/features/transactions/swap/services/tradeService/transformations/buildQuoteRequest'
import { getWrapType } from 'uniswap/src/features/transactions/swap/utils/wrap'
import { WrapType } from 'uniswap/src/features/transactions/types/wrap'
import { createPublicClient, http, type Chain, type PublicClient } from 'viem'
import { baseSepolia, sepolia, unichainSepolia } from 'viem/chains'

/**
 * The Uniswap entry-gateway / Trading API does not serve Spry's testnets: every
 * quote request returns 401. For the Spry deployment we therefore synthesize
 * quote responses locally and feed them through the normal `transformQuoteToTrade`
 * pipeline, so the resulting trade objects are identical to real API responses.
 *
 * Two cases are handled:
 *  - Wrap/unwrap (native ETH <-> WETH): deterministic 1:1, no chain reads.
 *  - Spry pool swaps (ETH/sptA/sptB/...): the pools are discovered from the Spry
 *    subgraph, every candidate route is priced on-chain via the V4 Quoter
 *    (authoritative, reflects the SpryHook dynamic fee), and the best is kept.
 *
 * Works on every Spry-deployed chain (Unichain Sepolia, Base Sepolia). Returns
 * null for anything else, so the caller falls through to "no trade".
 */
export async function buildSpryLocalQuote(
  validatedInput: ValidatedTradeInput,
  slippageTolerance?: number,
): Promise<DiscriminatedQuoteResponse | null> {
  const wrapQuote = buildSpryWrapQuote(validatedInput)
  if (wrapQuote) {
    return wrapQuote
  }
  return buildSprySwapQuote(validatedInput, slippageTolerance)
}

/**
 * Wrap/unwrap (native ETH <-> WETH) is deterministic 1:1 and needs no chain reads,
 * so the response is built purely from the validated input. Returns null for any
 * non-wrap pair.
 */
export function buildSpryWrapQuote(validatedInput: ValidatedTradeInput): DiscriminatedQuoteResponse | null {
  // Scope to Spry-deployed chains; every other chain keeps the real Trading API path.
  if (!isSpryChain(validatedInput.currencyIn.chainId)) {
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

// Direct RPC per Spry chain (the Uniswap gateway proxy 401s on these testnets);
// CSP allows each chain's RPC host. The viem chain object carries multicall3 +
// defaults; the URL comes from @spry/config.
const VIEM_CHAIN_BY_ID: Record<number, Chain> = {
  [UniverseChainId.UnichainSepolia]: unichainSepolia,
  [UniverseChainId.BaseSepolia]: baseSepolia,
  [UniverseChainId.Sepolia]: sepolia,
}

// One read-only client per chain, built lazily and memoized. createPublicClient
// does no I/O (connections open on the first call), so this is cheap.
const clientByChain = new Map<number, PublicClient>()

/**
 * The shared read-only viem client for a Spry chain. Used by every Spry rail
 * (quote, swap-tx, approval, LP, positions, fee widgets) so they all read the
 * right chain's RPC. Throws for a chain Spry is not configured for.
 */
export function getSpryPublicClient(chainId: number): PublicClient {
  const existing = clientByChain.get(chainId)
  if (existing) {
    return existing
  }
  const chain = VIEM_CHAIN_BY_ID[chainId]
  const rpcUrl = getSpryRpcUrl(chainId)
  if (!chain || !rpcUrl) {
    throw new Error(`Spry: no RPC client configured for chain ${chainId}`)
  }
  const client = createPublicClient({ chain, transport: http(rpcUrl) })
  clientByChain.set(chainId, client)
  return client
}

/** The Trading API chain-id enum member for a chain (the enum values are the EIP-155 ids). */
function toApiChainId(chainId: number): TradingApi.ChainId {
  return chainId as TradingApi.ChainId
}

/** One hop priced by the Quoter: the hop plus its input/output amounts. */
interface QuotedHop {
  hop: SpryHop
  amountIn: bigint
  amountOut: bigint
}

/** A V4 route token in the shape parseV4PoolApi expects (native ETH uses the zero address). */
function routeToken(currency: SpryPoolCurrency, apiChainId: TradingApi.ChainId): TradingApi.TokenInRoute {
  return {
    address: currency.address,
    chainId: apiChainId,
    decimals: String(currency.decimals),
    symbol: currency.symbol,
  }
}

/**
 * Price one route hop-by-hop, exactly as the router executes the path. For exact-in
 * the amount flows forward; for exact-out we size each hop's required input walking
 * backward, then restore forward order. Throws if any hop reverts (illiquid pool).
 */
async function quoteSpryRoute(params: {
  route: SpryHop[]
  isExactIn: boolean
  exactAmount: bigint
  quoter: SpryQuoterClient
}): Promise<QuotedHop[]> {
  const { route, isExactIn, exactAmount, quoter } = params
  if (isExactIn) {
    const quoted: QuotedHop[] = []
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
    return quoted
  }

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
  return backward
}

function routeInput(quoted: QuotedHop[]): bigint {
  return quoted[0]?.amountIn ?? BigInt(0)
}
function routeOutput(quoted: QuotedHop[]): bigint {
  return quoted[quoted.length - 1]?.amountOut ?? BigInt(0)
}

/**
 * Prices a Spry pool swap on a Spry-deployed chain. Discovers the pools, finds every
 * candidate route (direct or multi-hop, across tiers), prices each on-chain via the V4
 * Quoter, and keeps the best. Produces a CLASSIC quote with a single V4 route of N
 * pools, which transformQuoteToTrade turns into a ClassicTrade whose amounts come
 * straight from the Quoter. Returns null for any pair with no priceable Spry route.
 */
export async function buildSprySwapQuote(
  validatedInput: ValidatedTradeInput,
  slippageTolerance?: number,
): Promise<DiscriminatedQuoteResponse | null> {
  const { currencyIn, currencyOut } = validatedInput
  const chainId = currencyIn.chainId

  if (!isSpryChain(chainId)) {
    return null
  }

  const config = getSpryConfig(chainId)
  if (!config) {
    return null
  }
  const graph = await discoverSpryPoolGraph(chainId)
  if (!graph) {
    return null
  }
  const apiChainId = toApiChainId(chainId)
  const client = getSpryPublicClient(chainId)

  const fromCurrency = toPoolCurrency(currencyIn)
  const toCurrency = toPoolCurrency(currencyOut)
  const routes = findSpryRoutes({ pools: graph.pools, from: fromCurrency, to: toCurrency })
  if (routes.length === 0) {
    return null
  }

  const simulate: SimulateQuoteFn = async (request) =>
    (await client.simulateContract(request as never)).result as readonly [bigint, bigint]
  const read: StateViewReadFn = (request) => client.readContract(request as never) as Promise<unknown>
  const quoter = createSpryQuoterClient(simulate, config.addresses.quoter)
  const stateView = createSpryStateViewClient(read, config.addresses.stateView)

  const isExactIn = validatedInput.requestTradeType === TradingApi.TradeType.EXACT_INPUT
  const exactAmount = BigInt(validatedInput.amount.quotient.toString())

  // Price every candidate route in parallel; a route whose pool reverts (e.g. no
  // liquidity) drops out rather than failing the whole quote.
  const priced = (
    await Promise.all(
      routes.map((route) => quoteSpryRoute({ route, isExactIn, exactAmount, quoter }).catch(() => null)),
    )
  ).filter((quoted): quoted is QuotedHop[] => quoted !== null && quoted.length > 0)
  if (priced.length === 0) {
    return null
  }

  // Best execution: the most output for exact-in, the least input for exact-out.
  const best = priced.reduce((incumbent, candidate) => {
    const candidateWins = isExactIn
      ? routeOutput(candidate) > routeOutput(incumbent)
      : routeInput(candidate) < routeInput(incumbent)
    return candidateWins ? candidate : incumbent
  })

  const first = best[0]
  const last = best[best.length - 1]
  if (!first || !last) {
    return null
  }
  const totalAmountIn = first.amountIn
  const totalAmountOut = last.amountOut

  // Per-pool state for the chosen route. sqrtPriceX96 and tick come from the same
  // slot0 read so the v4-sdk Pool's PRICE_BOUNDS invariant holds.
  const states = await Promise.all(
    best.map(async ({ hop }) => {
      const [slot0, liquidity] = await Promise.all([stateView.getSlot0(hop.poolId), stateView.getLiquidity(hop.poolId)])
      return { slot0, liquidity }
    }),
  )

  const v4Pools: TradingApi.V4PoolInRoute[] = best.map(({ hop, amountIn, amountOut }, index) => {
    const state = states[index]
    const tokenIn = findSpryCurrency(graph, hop.currencyIn)
    const tokenOut = findSpryCurrency(graph, hop.currencyOut)
    if (!state || !tokenIn || !tokenOut) {
      throw new Error('Spry route hop is missing pool state or currency metadata')
    }
    return {
      type: 'v4-pool',
      address: hop.poolId,
      tokenIn: routeToken(tokenIn, apiChainId),
      tokenOut: routeToken(tokenOut, apiChainId),
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
      chainId: apiChainId,
      tradeType: validatedInput.requestTradeType,
      route: [v4Pools],
      // Carry the resolved tolerance so ClassicTrade derives minOut/maxIn from the
      // user's setting (or the L2 auto-min), not the 5.5% fallback.
      slippage: slippageTolerance,
    },
  }
  return response
}
