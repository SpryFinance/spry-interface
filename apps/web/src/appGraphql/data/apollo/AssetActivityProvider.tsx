import { GraphQLApi } from '@universe/api'
import { PropsWithChildren, useEffect, useMemo, useState } from 'react'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { logger } from 'utilities/src/logger/logger'
import { useEvent } from 'utilities/src/react/hooks'
import { createAdaptiveRefetchContext } from '~/appGraphql/data/apollo/AdaptiveRefetch'
import { useAccount } from '~/hooks/useAccount'
import { usePrevious } from '~/hooks/usePrevious'

const { Provider: AdaptiveAssetActivityProvider } = createAdaptiveRefetchContext<GraphQLApi.ActivityWebQueryResult>()

const PAGE_SIZE = 100
const INITIAL_PAGE = 1

function AssetActivityProviderInternal({ children }: PropsWithChildren) {
  const account = useAccount()
  const previousAccount = usePrevious(account.address)
  const { isTestnetModeEnabled, gqlChains } = useEnabledChains()
  const previousIsTestnetModeEnabled = usePrevious(isTestnetModeEnabled)

  const [lazyFetch, query] = GraphQLApi.useActivityWebLazyQuery()

  const baseVariables = useMemo<GraphQLApi.ActivityWebQueryVariables>(
    () => ({
      account: account.address ?? '',
      chains: gqlChains,
      // Backend will return off-chain activities even if gqlChains are all testnets.
      includeOffChain: !isTestnetModeEnabled,
      // SPRY: the web fiat on-ramp was removed, so no FOR transaction IDs are passed.
      onRampTransactionIDs: [],
      pageSize: PAGE_SIZE,
      page: INITIAL_PAGE,
    }),
    [account.address, gqlChains, isTestnetModeEnabled],
  )

  const fetch = useEvent(() => {
    lazyFetch({
      variables: baseVariables,
    }).catch((error) => {
      logger.error(error, {
        tags: {
          file: 'AssetActivityProvider.tsx',
          function: 'fetch',
        },
      })
    })
  })

  return (
    <AdaptiveAssetActivityProvider
      query={query}
      fetch={fetch}
      stale={account.address !== previousAccount || isTestnetModeEnabled !== previousIsTestnetModeEnabled}
    >
      {children}
    </AdaptiveAssetActivityProvider>
  )
}

export function AssetActivityProvider({ children }: PropsWithChildren) {
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    setInitialized(true)
  }, [])

  if (!initialized) {
    return children // Immediately render children first without provider overhead.
  }
  return <AssetActivityProviderInternal>{children}</AssetActivityProviderInternal>
}
