import { useQuery } from '@tanstack/react-query'
import { COMMON_BASES } from 'uniswap/src/constants/routing'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { type CurrencyInfo, type PortfolioBalance } from 'uniswap/src/features/dataApi/types'
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { type CurrencyId } from 'uniswap/src/types/currency'
import { ONE_SECOND_MS } from 'utilities/src/time/time'
import { type Address, erc20Abi, formatUnits } from 'viem'

function buildBalance(info: CurrencyInfo, raw: bigint): PortfolioBalance {
  return {
    id: info.currencyId,
    cacheId: `TokenBalance:${info.currencyId}`,
    quantity: Number(formatUnits(raw, info.currency.decimals)),
    // No price feed on this testnet, so there is no USD value to show.
    balanceUSD: null,
    currencyInfo: info,
    relativeChange24: null,
    isHidden: false,
  }
}

/**
 * The Uniswap portfolio gateway does not serve Base Sepolia (backendSupported:
 * false), so the token selector's "Your tokens" list is empty there. This reads
 * the connected address's balances for the Spry token set directly on-chain and
 * returns them in the same shape the portfolio uses, so they can be merged in.
 * Only non-zero balances are returned (zero-balance tokens still appear in the
 * common-bases row). Empty/undefined until the read resolves or when no address.
 */
export function useSpryOnchainBalances(evmAddress?: string): Record<CurrencyId, PortfolioBalance> | undefined {
  const { data } = useQuery({
    queryKey: ['spryOnchainBalances', evmAddress],
    enabled: Boolean(evmAddress),
    refetchInterval: ONE_SECOND_MS * 15,
    staleTime: ONE_SECOND_MS * 10,
    queryFn: async (): Promise<Record<CurrencyId, PortfolioBalance>> => {
      if (!evmAddress) {
        return {}
      }
      const owner = evmAddress as Address
      const bases = COMMON_BASES[UniverseChainId.BaseSepolia] ?? []
      const native = bases.find((base) => base.currency.isNative)
      const erc20s = bases.filter((base) => !base.currency.isNative)

      const [nativeBalance, erc20Balances] = await Promise.all([
        native ? spryPublicClient.getBalance({ address: owner }) : Promise.resolve(BigInt(0)),
        spryPublicClient.multicall({
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
        result[native.currencyId] = buildBalance(native, nativeBalance)
      }
      erc20s.forEach((base, index) => {
        const entry = erc20Balances[index]
        const raw = entry?.status === 'success' ? (entry.result as bigint) : BigInt(0)
        if (raw > BigInt(0)) {
          result[base.currencyId] = buildBalance(base, raw)
        }
      })
      return result
    },
  })

  return data
}
