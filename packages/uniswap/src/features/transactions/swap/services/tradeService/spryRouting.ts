import { getSpryConfig } from '@spry/config'
import { PoolTier } from '@spry/fee'
import { NATIVE_CURRENCY, poolId, spryPoolKey, type Address, type Hex, type PoolKey } from '@spry/sdk'
import type { Currency } from '@uniswap/sdk-core'
import { SPRY_TEST_TOKEN_A, SPRY_TEST_TOKEN_B } from 'uniswap/src/constants/tokens'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

/**
 * The Spry pool graph and a shortest-path router over it. The Uniswap routing API
 * does not serve Base Sepolia, so we model the deployed pools locally and find the
 * route (1 or 2 hops) ourselves; both the quote and the swap-tx encoder share this.
 *
 * Deployed pools (both BLUE_CHIP tier + the deployed SpryHook, verified to hash to
 * their on-chain poolIds):
 *  - ETH (native) <-> sptA
 *  - sptA <-> sptB
 * sptA is the hub, so ETH <-> sptB routes through it in two hops.
 */
const SPRY_POOL_TIER = PoolTier.BLUE_CHIP

function eqAddr(a: Address, b: Address): boolean {
  return areAddressesEqual({
    addressInput1: { address: a, platform: Platform.EVM },
    addressInput2: { address: b, platform: Platform.EVM },
  })
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

/** The Spry pools deployed on the chain and the currencies they connect. Base Sepolia only. */
export function getSpryPoolGraph(chainId: number): SpryPoolGraph | null {
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
    spryPoolKey({ tokenA: NATIVE_CURRENCY, tokenB: sptA, tier: SPRY_POOL_TIER, hookAddress }),
    spryPoolKey({ tokenA: sptA, tokenB: sptB, tier: SPRY_POOL_TIER, hookAddress }),
  ]
  const currencies: SpryPoolCurrency[] = [
    { address: NATIVE_CURRENCY, decimals: 18, symbol: 'ETH' },
    { address: sptA, decimals: SPRY_TEST_TOKEN_A.decimals, symbol: SPRY_TEST_TOKEN_A.symbol ?? 'sptA' },
    { address: sptB, decimals: SPRY_TEST_TOKEN_B.decimals, symbol: SPRY_TEST_TOKEN_B.symbol ?? 'sptB' },
  ]
  return { pools, currencies }
}

/** The currency metadata for a pool-currency address, or null if it is not a Spry currency. */
export function findSpryCurrency(graph: SpryPoolGraph, address: Address): SpryPoolCurrency | null {
  return graph.currencies.find((currency) => eqAddr(currency.address, address)) ?? null
}

/**
 * Shortest pool path from `from` to `to` over the Spry pool graph (BFS), or null if
 * the pair is not connected. Each pool is an edge between its two currencies.
 */
export function findSpryRoute(params: { pools: PoolKey[]; from: Address; to: Address }): SpryHop[] | null {
  const { pools, from, to } = params
  if (eqAddr(from, to)) {
    return null
  }
  const visited = new Set<string>([normalizeTokenAddressForCache(from)])
  const queue: { currency: Address; hops: SpryHop[] }[] = [{ currency: from, hops: [] }]

  for (let head = 0; head < queue.length; head++) {
    const item = queue[head]
    if (!item) {
      continue
    }
    for (const pool of pools) {
      const isCurrency0 = eqAddr(item.currency, pool.currency0)
      const isCurrency1 = eqAddr(item.currency, pool.currency1)
      if (!isCurrency0 && !isCurrency1) {
        continue
      }
      const next = isCurrency0 ? pool.currency1 : pool.currency0
      const hop: SpryHop = {
        poolKey: pool,
        poolId: poolId(pool),
        zeroForOne: isCurrency0,
        currencyIn: item.currency,
        currencyOut: next,
      }
      if (eqAddr(next, to)) {
        return [...item.hops, hop]
      }
      const key = normalizeTokenAddressForCache(next)
      if (visited.has(key)) {
        continue
      }
      visited.add(key)
      queue.push({ currency: next, hops: [...item.hops, hop] })
    }
  }
  return null
}
