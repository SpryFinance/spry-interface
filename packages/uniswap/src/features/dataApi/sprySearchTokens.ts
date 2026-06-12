// SPRY: local token search for Base Sepolia. The gateway SearchTokens endpoint
// 401s there, so the token selectors (swap, create position) could never
// resolve a pasted address or a symbol search. This resolves searches locally:
//
//   address queries: COMMON_BASES match -> Spry subgraph Token entity (any
//   token already in a Spry pool) -> live on-chain ERC20 metadata (so ANY
//   ERC20 address can be added, matching mainnet behavior)
//   text queries: COMMON_BASES + subgraph symbol/name substring match
//
// Returned through useSearchTokens, so every selector built on
// useTokenSectionsForSearchResults gets it on all breakpoints.

import { getSpryConfig } from '@spry/config'
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
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { currencyId as buildCurrencyId, currencyIdToAddress, currencyIdToChain } from 'uniswap/src/utils/currencyId'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'

const SPRY_SEARCH_CHAIN_ID = UniverseChainId.BaseSepolia

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

/**
 * buildPartialCurrencyInfo (the COMMON_BASES builder) never sets currencyId, and
 * search-result consumers (token warnings, recent searches) read it - so every
 * CurrencyInfo this module returns gets an explicit currencyId.
 */
function toSearchCurrencyInfo(info: CurrencyInfo): CurrencyInfo {
  return info.currencyId ? info : { ...info, currencyId: buildCurrencyId(info.currency) }
}

function subgraphTokenToCurrencyInfo(row: SubgraphTokenRow): CurrencyInfo {
  const decimals = Number.parseInt(row.decimals, 10)
  const currency = isSameEvmAddress(row.id, '0x0000000000000000000000000000000000000000')
    ? nativeOnChain(SPRY_SEARCH_CHAIN_ID)
    : new Token(SPRY_SEARCH_CHAIN_ID, row.id, decimals, row.symbol, row.name)
  return toSearchCurrencyInfo(buildPartialCurrencyInfo(currency))
}

function commonBaseMatches(query: string): CurrencyInfo[] {
  const q = query.toLowerCase()
  return (COMMON_BASES[SPRY_SEARCH_CHAIN_ID] ?? [])
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

async function resolveByAddress(client: SpryGraphClient | null, address: string): Promise<CurrencyInfo | null> {
  const [known] = commonBaseMatches(address)
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
      return subgraphTokenToCurrencyInfo(token)
    }
  }

  // arbitrary ERC20: read metadata live so pasting any address still works
  const erc20 = { address: getAddress(address), abi: erc20Abi } as const
  const [symbol, name, decimals] = await spryPublicClient.multicall({
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
    SPRY_SEARCH_CHAIN_ID,
    address,
    decimals.result,
    symbol.status === 'success' ? symbol.result : undefined,
    name.status === 'success' ? name.result : undefined,
  )
  return toSearchCurrencyInfo(buildPartialCurrencyInfo(currency))
}

async function searchByAddress(client: SpryGraphClient, address: string): Promise<CurrencyInfo[]> {
  const info = await resolveByAddress(client, address)
  return info ? [info] : []
}

/**
 * One-token local resolution for Base Sepolia (common bases -> subgraph ->
 * live ERC20 metadata). Used as the fallback inside useCurrencyInfo so a
 * selected unknown token actually renders (the gateway token query the rest of
 * the app re-resolves through serves nothing on testnet).
 */
export async function fetchSpryCurrencyInfoByAddress(address: string): Promise<CurrencyInfo | null> {
  const config = getSpryConfig(SPRY_SEARCH_CHAIN_ID)
  const client = config?.subgraphUrl ? createSpryGraphClient(config.subgraphUrl) : null
  return resolveByAddress(client, address)
}

/**
 * Spry local fallback for {@link useCurrencyInfo}: resolves a Base Sepolia
 * currencyId without the gateway. Returns undefined for other chains, while
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
  const applies = chainId === SPRY_SEARCH_CHAIN_ID && !!address && isAddress(address)

  const { data } = useQuery({
    queryKey: ['spryLocalCurrencyInfo', address ? normalizeTokenAddressForCache(address) : ''],
    queryFn: () => fetchSpryCurrencyInfoByAddress(address ?? ''),
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

async function searchByText(client: SpryGraphClient, query: string): Promise<CurrencyInfo[]> {
  const { tokens } = await client.request<{ tokens: SubgraphTokenRow[] }>(
    `query($q: String!) {
      tokens(first: 10, where: { or: [{ symbol_contains_nocase: $q }, { name_contains_nocase: $q }] }) {
        id symbol name decimals
      }
    }`,
    { q: query },
  )
  const fromSubgraph = tokens.map(subgraphTokenToCurrencyInfo)
  const fromBases = commonBaseMatches(query)
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
  // chainFilter null means "all enabled chains" - on this app that includes Base
  // Sepolia, and the gateway serves none of them, so handle it locally too.
  const applies = chainFilter === SPRY_SEARCH_CHAIN_ID || chainFilter === null
  const query = searchQuery?.trim() ?? ''

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sprySearchTokens', query],
    queryFn: async (): Promise<CurrencyInfo[]> => {
      const config = getSpryConfig(SPRY_SEARCH_CHAIN_ID)
      if (!config?.subgraphUrl) {
        return commonBaseMatches(query)
      }
      const client = createSpryGraphClient(config.subgraphUrl)
      return isAddress(query) ? searchByAddress(client, query) : searchByText(client, query)
    },
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
