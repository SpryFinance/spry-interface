import { isSpryChain } from '@spry/config'
import { useQuery } from '@tanstack/react-query'
import { COMMON_BASES } from 'uniswap/src/constants/routing'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { type CurrencyInfo, type PortfolioBalance } from 'uniswap/src/features/dataApi/types'
import { getSpryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { type CurrencyId } from 'uniswap/src/types/currency'
import { currencyId as toCurrencyId } from 'uniswap/src/utils/currencyId'
import { ONE_SECOND_MS } from 'utilities/src/time/time'
import { type Address, erc20Abi, formatUnits } from 'viem'

function buildBalance(info: CurrencyInfo, raw: bigint): PortfolioBalance {
  // COMMON_BASES entries are "partial" CurrencyInfos with no currencyId, so derive
  // it from the currency. A missing currencyId crashes currencyId-based consumers
  // such as the token warning modal (currencyIdToAddress(undefined).split).
  const id = toCurrencyId(info.currency)
  return {
    id,
    cacheId: `TokenBalance:${id}`,
    quantity: Number(formatUnits(raw, info.currency.decimals)),
    // No price feed on this testnet, so there is no USD value to show.
    balanceUSD: null,
    currencyInfo: { ...info, currencyId: id },
    relativeChange24: null,
    isHidden: false,
  }
}

/** Read the address's non-zero common-base balances on one Spry chain. */
async function fetchSpryChainBalances(
  chainId: number,
  owner: Address,
): Promise<Record<CurrencyId, PortfolioBalance>> {
  const bases = COMMON_BASES[chainId] ?? []
  const native = bases.find((base) => base.currency.isNative)
  const erc20s = bases.filter((base) => !base.currency.isNative)
  const client = getSpryPublicClient(chainId)

  const [nativeBalance, erc20Balances] = await Promise.all([
    native ? client.getBalance({ address: owner }) : Promise.resolve(BigInt(0)),
    client.multicall({
      contracts: erc20s.map((base) => ({
        address: base.currency.wrapped.address as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      })),
    }),
  ])

  const result: Record<CurrencyId, PortfolioBalance> = {}
  if (native && nativeBalance > BigInt(0)) {
    const balance = buildBalance(native, nativeBalance)
    result[balance.id] = balance
  }
  erc20s.forEach((base, index) => {
    const entry = erc20Balances[index]
    const raw = entry?.status === 'success' ? (entry.result as bigint) : BigInt(0)
    if (raw > BigInt(0)) {
      const balance = buildBalance(base, raw)
      result[balance.id] = balance
    }
  })
  return result
}

/**
 * The Uniswap portfolio gateway does not serve Spry's testnets (backendSupported:
 * false), so the token selector's "Your tokens" list is empty there. This reads
 * the connected address's balances for the Spry token set directly on-chain, for
 * every enabled Spry chain, and returns them in the same shape the portfolio uses
 * so they can be merged in. Only non-zero balances are returned (zero-balance
 * tokens still appear in the common-bases row). Empty/undefined until the read
 * resolves or when no address.
 */
export function useSpryOnchainBalances(evmAddress?: string): Record<CurrencyId, PortfolioBalance> | undefined {
  // Read balances for every enabled Spry chain, so other chains do not pay for a
  // round-trip and only Spry chains surface their tokens in the all-chains view.
  const { chains } = useEnabledChains()
  const spryChains = chains.filter((chainId) => isSpryChain(chainId))
  const { data } = useQuery({
    queryKey: ['spryOnchainBalances', evmAddress, spryChains.join(',')],
    enabled: Boolean(evmAddress) && spryChains.length > 0,
    refetchInterval: ONE_SECOND_MS * 15,
    staleTime: ONE_SECOND_MS * 10,
    queryFn: async (): Promise<Record<CurrencyId, PortfolioBalance>> => {
      if (!evmAddress) {
        return {}
      }
      const owner = evmAddress as Address
      // currencyId includes the chain, so per-chain results merge without collision.
      const perChain = await Promise.all(spryChains.map((chainId) => fetchSpryChainBalances(chainId, owner)))
      const merged: Record<CurrencyId, PortfolioBalance> = {}
      for (const chainBalances of perChain) {
        Object.assign(merged, chainBalances)
      }
      return merged
    },
  })

  return data
}
