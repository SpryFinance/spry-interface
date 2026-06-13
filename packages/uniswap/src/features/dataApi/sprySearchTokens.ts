// SPRY: local token search for the Spry chains. The gateway SearchTokens
// endpoint 401s there, so the token selectors (swap, create position) could
// never resolve a pasted address or a symbol search. This resolves searches
// locally, per chain:
//
//   address queries: COMMON_BASES match -> Spry subgraph Token entity (any
//   token already in a Spry pool) -> live on-chain ERC20 metadata (so ANY
//   ERC20 address can be added, matching mainnet behavior)
//   text queries: COMMON_BASES + subgraph symbol/name substring match
//
// When the selector filters to one Spry chain, that chain is searched; when it
// does not filter (all chains), every Spry-deployed chain is searched and the
// results merged (a CurrencyInfo's currencyId carries its chain, so same-symbol
// tokens on different chains stay distinct). Returned through useSearchTokens,
// so every selector built on useTokenSectionsForSearchResults gets it on all
// breakpoints.

import { getSpryConfig, isSpryChain, SPRY_DEPLOYED_CHAIN_IDS } from '@spry/config'
import { createSpryGraphClient, type SpryGraphClient } from '@spry/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { GqlResult } from '@universe/api'
import { Token } from '@uniswap/sdk-core'
import { useMemo } from 'react'
import { erc20Abi, getAddress, isAddress } from 'viem'
import { COMMON_BASES, buildPartialCurrencyInfo } from 'uniswap/src/constants/routing'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { normalizeCurrencyIdForMapLookup, normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { getSpryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { currencyId as buildCurrencyId, currencyIdToAddress, currencyIdToChain } from 'uniswap/src/utils/currencyId'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'

interface SubgraphTokenRow {
  id: string
  symbol: string
  name: string
  decimals: string
}

function isSameEvmAddress(a: string, b: string): boolean {
  return areAddressesEqual({
    addressInput1: { address: a, platform: Platform.EVM },
    addressInput2: { address: b, platform: Platform.EVM },
  })
}

/** The Spry chains a search should cover for a given chain filter (Unichain Sepolia first). */
function spryTargetChains(chainFilter: UniverseChainId | null): number[] {
  if (chainFilter === null) {
    return SPRY_DEPLOYED_CHAIN_IDS
  }
  return isSpryChain(chainFilter) ? [chainFilter] : []
}

/**
 * buildPartialCurrencyInfo (the COMMON_BASES builder) never sets currencyId, and
 * search-result consumers (token warnings, recent searches) read it - so every
 * CurrencyInfo this module returns gets an explicit currencyId.
 */
function toSearchCurrencyInfo(info: CurrencyInfo): CurrencyInfo {
  return info.currencyId ? info : { ...info, currencyId: buildCurrencyId(info.currency) }
}

function subgraphTokenToCurrencyInfo(chainId: number, row: SubgraphTokenRow): CurrencyInfo {
  const decimals = Number.parseInt(row.decimals, 10)
  const currency = isSameEvmAddress(row.id, '0x0000000000000000000000000000000000000000')
    ? nativeOnChain(chainId)
    : new Token(chainId, row.id, decimals, row.symbol, row.name)
  return toSearchCurrencyInfo(buildPartialCurrencyInfo(currency))
}

function commonBaseMatches(chainId: number, query: string): CurrencyInfo[] {
  const q = query.toLowerCase()
  return (COMMON_BASES[chainId] ?? [])
    .filter((info) => {
      const { currency } = info
      if (isAddress(query)) {
        return !currency.isNative && isSameEvmAddress(currency.address, query)
      }
      return (
        (currency.symbol?.toLowerCase().includes(q) ?? false) || (currency.name?.toLowerCase().includes(q) ?? false)
      )
    })
    .map(toSearchCurrencyInfo)
}

async function resolveByAddress(args: {
  chainId: number
  client: SpryGraphClient | null
  address: string
}): Promise<CurrencyInfo | null> {
  const { chainId, client, address } = args
  const [known] = commonBaseMatches(chainId, address)
  if (known) {
    return known
  }

  // any token already indexed in a Spry pool (the subgraph stores ids lowercase)
  if (client) {
    const { token } = await client.request<{ token: SubgraphTokenRow | null }>(
      `query($id: ID!) { token(id: $id) { id symbol name decimals } }`,
      { id: normalizeTokenAddressForCache(address) },
    )
    if (token) {
      return subgraphTokenToCurrencyInfo(chainId, token)
    }
  }

  // arbitrary ERC20: read metadata live so pasting any address still works
  const erc20 = { address: getAddress(address), abi: erc20Abi } as const
  const [symbol, name, decimals] = await getSpryPublicClient(chainId).multicall({
    contracts: [
      { ...erc20, functionName: 'symbol' },
      { ...erc20, functionName: 'name' },
      { ...erc20, functionName: 'decimals' },
    ],
    allowFailure: true,
  })
  if (decimals.status !== 'success') {
    return null // not an ERC20 (or not deployed) - nothing to offer
  }
  const currency = new Token(
    chainId,
    address,
    decimals.result,
    symbol.status === 'success' ? symbol.result : undefined,
    name.status === 'success' ? name.result : undefined,
  )
  return toSearchCurrencyInfo(buildPartialCurrencyInfo(currency))
}

async function searchByAddress(args: {
  chainId: number
  client: SpryGraphClient | null
  address: string
}): Promise<CurrencyInfo[]> {
  const info = await resolveByAddress(args)
  return info ? [info] : []
}

async function searchByText(args: {
  chainId: number
  client: SpryGraphClient | null
  query: string
}): Promise<CurrencyInfo[]> {
  const { chainId, client, query } = args
  const fromBases = commonBaseMatches(chainId, query)
  if (!client) {
    return fromBases
  }
  const { tokens } = await client.request<{ tokens: SubgraphTokenRow[] }>(
    `query($q: String!) {
      tokens(first: 10, where: { or: [{ symbol_contains_nocase: $q }, { name_contains_nocase: $q }] }) {
        id symbol name decimals
      }
    }`,
    { q: query },
  )
  const fromSubgraph = tokens.map((row) => subgraphTokenToCurrencyInfo(chainId, row))
  // common bases first (they carry curated metadata/logos); dedupe by currencyId
  const seen = new Set<string>()
  return [...fromBases, ...fromSubgraph].filter((info) => {
    const key = normalizeCurrencyIdForMapLookup(info.currencyId)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/** Resolve a query across one chain (subgraph client from its config; null when none). */
async function searchOneChain(chainId: number, query: string): Promise<CurrencyInfo[]> {
  const config = getSpryConfig(chainId)
  const client = config?.subgraphUrl ? createSpryGraphClient(config.subgraphUrl) : null
  return isAddress(query)
    ? searchByAddress({ chainId, client, address: query })
    : searchByText({ chainId, client, query })
}

/** Resolve a query across every target Spry chain, merged and deduped by currencyId. */
async function searchSpryChains(chains: number[], query: string): Promise<CurrencyInfo[]> {
  const perChain = await Promise.all(
    chains.map((chainId) => searchOneChain(chainId, query).catch(() => [] as CurrencyInfo[])),
  )
  const seen = new Set<string>()
  return perChain.flat().filter((info) => {
    const key = normalizeCurrencyIdForMapLookup(info.currencyId)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/**
 * One-token local resolution on a Spry chain (common bases -> subgraph -> live
 * ERC20 metadata). Used as the fallback inside useCurrencyInfo so a selected
 * unknown token actually renders (the gateway token query the rest of the app
 * re-resolves through serves nothing on these testnets).
 */
export async function fetchSpryCurrencyInfoByAddress(chainId: number, address: string): Promise<CurrencyInfo | null> {
  const config = getSpryConfig(chainId)
  const client = config?.subgraphUrl ? createSpryGraphClient(config.subgraphUrl) : null
  return resolveByAddress({ chainId, client, address })
}

/**
 * Spry local fallback for {@link useCurrencyInfo}: resolves a Spry-chain
 * currencyId without the gateway. Returns undefined for non-Spry chains, while
 * skipped, or when the address is not a live ERC20.
 */
export function useSpryLocalCurrencyInfo(
  currencyIdInput: string | undefined,
  options?: { skip?: boolean },
): Maybe<CurrencyInfo> {
  const chainId = currencyIdInput ? currencyIdToChain(currencyIdInput) : undefined
  let address: string | undefined
  try {
    address = currencyIdInput ? currencyIdToAddress(currencyIdInput) : undefined
  } catch (_error) {
    address = undefined
  }
  const applies = chainId !== null && chainId !== undefined && isSpryChain(chainId) && !!address && isAddress(address)

  const { data } = useQuery({
    queryKey: ['spryLocalCurrencyInfo', chainId ?? 0, address ? normalizeTokenAddressForCache(address) : ''],
    queryFn: () => fetchSpryCurrencyInfoByAddress(chainId ?? 0, address ?? ''),
    enabled: applies && !options?.skip,
    staleTime: Infinity, // ERC20 metadata is immutable
  })

  return useMemo(() => {
    if (!applies || !data) {
      return undefined
    }
    // keep the caller's exact currencyId so map lookups keyed on it stay stable
    return { ...data, currencyId: currencyIdInput ?? data.currencyId }
  }, [applies, data, currencyIdInput])
}

/**
 * Local search results for Spry chains, or null when the query targets a chain
 * this path does not handle (callers should then use the gateway).
 */
export function useSprySearchTokens({
  searchQuery,
  chainFilter,
  skip,
}: {
  searchQuery: string | null
  chainFilter: UniverseChainId | null
  skip: boolean
}): GqlResult<CurrencyInfo[]> | null {
  // A specific Spry chain searches that chain; "all chains" (null) searches every
  // Spry-deployed chain. The gateway serves none of them, so handle it locally.
  const targetChains = spryTargetChains(chainFilter)
  const applies = targetChains.length > 0
  const query = searchQuery?.trim() ?? ''

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sprySearchTokens', targetChains.join(','), query],
    queryFn: async (): Promise<CurrencyInfo[]> => searchSpryChains(targetChains, query),
    enabled: applies && !skip && query.length > 0,
    staleTime: 60_000,
  })

  return useMemo(() => {
    if (!applies) {
      return null
    }
    return {
      data,
      loading: isLoading,
      error: error ?? undefined,
      refetch: (): void => {
        refetch().catch(() => undefined)
      },
    }
  }, [applies, data, isLoading, error, refetch])
}
