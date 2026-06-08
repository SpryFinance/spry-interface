import { getSpryConfig } from '@spry/config'
import { PoolTier } from '@spry/fee'
import { NATIVE_CURRENCY, poolId, sortCurrencies, spryPoolKey, type Address, type Hex, type PoolKey } from '@spry/sdk'
import { createSpryGraphClientForChain, fetchPools, type PoolRow } from '@spry/subgraph'
import type { Currency } from '@uniswap/sdk-core'
import { TradingApi } from '@universe/api'
import { SPRY_TEST_TOKEN_A, SPRY_TEST_TOKEN_B } from 'uniswap/src/constants/tokens'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

/**
 * The Spry pool graph and routing over it. The Uniswap routing API does not serve
 * Base Sepolia, so we discover the deployed pools (from the Spry subgraph) and find
 * routes ourselves; the quote prices every candidate route and keeps the best, and
 * the swap-tx encoder replays the chosen route back from the trade.
 *
 * sptA is the hub today (ETH<->sptA, sptA<->sptB), so ETH<->sptB routes in two hops;
 * adding more pools widens the graph automatically.
 */

// Fallback tier for the seed graph (used only if the subgraph is unreachable).
const SEED_POOL_TIER = PoolTier.BLUE_CHIP
// Discovery is cached briefly so repeated quotes do not refetch the pool list.
const DISCOVERY_TTL_MS = 30_000

function eqAddr(a: Address, b: Address): boolean {
  return areAddressesEqual({
    addressInput1: { address: a, platform: Platform.EVM },
    addressInput2: { address: b, platform: Platform.EVM },
  })
}

/** Case-insensitive equality for two bytes32 hex values (e.g. pool ids). */
function eqHex(a: Hex, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return false
  }
}

/**
 * The pool-currency address for a swap currency: native ETH is the v4 zero-address
 * sentinel (also the Trading-API native address), ERC20s use their own address.
 */
export function toPoolCurrency(currency: Currency): Address {
  return currency.isNative ? NATIVE_CURRENCY : (currency.wrapped.address as Address)
}

/** Token metadata for one pool currency, used to synthesize the V4 route response. */
export interface SpryPoolCurrency {
  /** Zero address for native ETH (matches NATIVE_ADDRESS_FOR_TRADING_API), else the ERC20 address. */
  address: Address
  decimals: number
  symbol: string
}

/** One hop of a Spry route: the pool, the swap direction, and the in/out pool currencies. */
export interface SpryHop {
  poolKey: PoolKey
  poolId: Hex
  zeroForOne: boolean
  currencyIn: Address
  currencyOut: Address
}

export interface SpryPoolGraph {
  pools: PoolKey[]
  currencies: SpryPoolCurrency[]
}

/**
 * The known pools as a static fallback, used only when the subgraph is unreachable so
 * swaps keep working. Base Sepolia: ETH<->sptA and sptA<->sptB (BLUE_CHIP + the hook).
 */
function seedSpryPoolGraph(chainId: number): SpryPoolGraph | null {
  if (chainId !== UniverseChainId.BaseSepolia) {
    return null
  }
  const config = getSpryConfig(UniverseChainId.BaseSepolia)
  if (!config) {
    return null
  }
  const hookAddress = config.addresses.spryHook
  const sptA = SPRY_TEST_TOKEN_A.address as Address
  const sptB = SPRY_TEST_TOKEN_B.address as Address
  const pools: PoolKey[] = [
    spryPoolKey({ tokenA: NATIVE_CURRENCY, tokenB: sptA, tier: SEED_POOL_TIER, hookAddress }),
    spryPoolKey({ tokenA: sptA, tokenB: sptB, tier: SEED_POOL_TIER, hookAddress }),
  ]
  const currencies: SpryPoolCurrency[] = [
    { address: NATIVE_CURRENCY, decimals: 18, symbol: 'ETH' },
    { address: sptA, decimals: SPRY_TEST_TOKEN_A.decimals, symbol: SPRY_TEST_TOKEN_A.symbol ?? 'sptA' },
    { address: sptB, decimals: SPRY_TEST_TOKEN_B.decimals, symbol: SPRY_TEST_TOKEN_B.symbol ?? 'sptB' },
  ]
  return { pools, currencies }
}

function addCurrency(map: Map<string, SpryPoolCurrency>, token: PoolRow['token0']): void {
  const address = token.id as Address
  const key = normalizeTokenAddressForCache(address)
  if (!map.has(key)) {
    map.set(key, { address, decimals: Number(token.decimals), symbol: token.symbol })
  }
}

/**
 * Build the pool graph from subgraph rows. Each row is reconstructed into a PoolKey
 * (the tier gives the tick spacing, the hook comes from config) and kept only if that
 * key reproduces the subgraph's pool id, so a schema/tier mismatch can never point a
 * swap at the wrong pool.
 */
function poolGraphFromRows(rows: PoolRow[], hookAddress: Address): SpryPoolGraph {
  const pools: PoolKey[] = []
  const currencyMap = new Map<string, SpryPoolCurrency>()
  for (const row of rows) {
    const key = spryPoolKey({
      tokenA: row.token0.id as Address,
      tokenB: row.token1.id as Address,
      tier: row.tier,
      hookAddress,
    })
    if (!eqHex(poolId(key), row.id)) {
      continue
    }
    pools.push(key)
    addCurrency(currencyMap, row.token0)
    addCurrency(currencyMap, row.token1)
  }
  return { pools, currencies: [...currencyMap.values()] }
}

async function fetchSpryPoolGraph(chainId: number): Promise<SpryPoolGraph | null> {
  const seed = seedSpryPoolGraph(chainId)
  const config = getSpryConfig(chainId)
  if (!config) {
    return seed
  }
  try {
    const client = createSpryGraphClientForChain(chainId)
    const rows = await fetchPools(client, { first: 100 })
    const graph = poolGraphFromRows(rows, config.addresses.spryHook)
    // If the subgraph is empty or every row failed verification, keep the seed.
    return graph.pools.length > 0 ? graph : seed
  } catch {
    return seed
  }
}

interface DiscoveryCacheEntry {
  promise: Promise<SpryPoolGraph | null>
  expiresAt: number
}
const discoveryCache = new Map<number, DiscoveryCacheEntry>()

/**
 * The Spry pools on the chain, discovered from the subgraph (cached briefly), with the
 * known pools as a fallback if the subgraph is unreachable. Concurrent callers share a
 * single in-flight fetch. Returns null on chains with no Spry deployment.
 */
export function discoverSpryPoolGraph(chainId: number): Promise<SpryPoolGraph | null> {
  const cached = discoveryCache.get(chainId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }
  const promise = fetchSpryPoolGraph(chainId)
  discoveryCache.set(chainId, { promise, expiresAt: Date.now() + DISCOVERY_TTL_MS })
  return promise
}

/** The currency metadata for a pool-currency address, or null if it is not a Spry currency. */
export function findSpryCurrency(graph: SpryPoolGraph, address: Address): SpryPoolCurrency | null {
  return graph.currencies.find((currency) => eqAddr(currency.address, address)) ?? null
}

/**
 * Every simple route (no repeated currency) from `from` to `to` over the pool graph,
 * up to `maxHops` hops. Parallel pools between the same pair (e.g. different tiers)
 * each yield a distinct route, so the quote can price them all and pick the best.
 */
export function findSpryRoutes(params: {
  pools: PoolKey[]
  from: Address
  to: Address
  maxHops?: number
}): SpryHop[][] {
  const { pools, from, to } = params
  const maxHops = params.maxHops ?? 3
  if (eqAddr(from, to)) {
    return []
  }
  const routes: SpryHop[][] = []

  const visitedInPath = (path: SpryHop[], currency: Address): boolean =>
    eqAddr(currency, from) || path.some((hop) => eqAddr(hop.currencyIn, currency) || eqAddr(hop.currencyOut, currency))

  const walk = (current: Address, path: SpryHop[]): void => {
    if (path.length >= maxHops) {
      return
    }
    for (const pool of pools) {
      const isCurrency0 = eqAddr(current, pool.currency0)
      const isCurrency1 = eqAddr(current, pool.currency1)
      if (!isCurrency0 && !isCurrency1) {
        continue
      }
      const next = isCurrency0 ? pool.currency1 : pool.currency0
      const hop: SpryHop = {
        poolKey: pool,
        poolId: poolId(pool),
        zeroForOne: isCurrency0,
        currencyIn: current,
        currencyOut: next,
      }
      if (eqAddr(next, to)) {
        routes.push([...path, hop])
        continue
      }
      if (visitedInPath(path, next)) {
        continue
      }
      walk(next, [...path, hop])
    }
  }

  walk(from, [])
  return routes
}

/**
 * Reconstruct the hops of the route a quote chose, read back from the trade's V4 route
 * (so the swap executes exactly what was quoted, never a re-derived "best" route at a
 * later block). Returns null if the route has no usable V4 pools.
 */
export function spryHopsFromRoute(poolsInRoute: readonly TradingApi.V4PoolInRoute[]): SpryHop[] | null {
  const hops: SpryHop[] = []
  for (const pool of poolsInRoute) {
    const tokenIn = pool.tokenIn.address as Address | undefined
    const tokenOut = pool.tokenOut.address as Address | undefined
    if (!tokenIn || !tokenOut) {
      return null
    }
    const [currency0, currency1] = sortCurrencies(tokenIn, tokenOut)
    const poolKey: PoolKey = {
      currency0,
      currency1,
      fee: Number(pool.fee),
      tickSpacing: Number(pool.tickSpacing),
      hooks: pool.hooks as Address,
    }
    hops.push({
      poolKey,
      poolId: poolId(poolKey),
      zeroForOne: eqAddr(tokenIn, currency0),
      currencyIn: tokenIn,
      currencyOut: tokenOut,
    })
  }
  return hops.length > 0 ? hops : null
}
