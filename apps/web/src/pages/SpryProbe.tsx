import { DEFAULT_CHAIN_ID, getSpryConfig } from '@spry/config'
import { formatFeePercent } from '@spry/fee'
import { createSpryGraphClientForChain, fetchPools, type PoolRow } from '@spry/subgraph'
import { useEffect, useState } from 'react'
import { Flex, Text } from 'ui/src'

// First live read from the Spry stack inside apps/web.
//
// This is a temporary probe (mounted at /spry) that proves the @spry/* packages
// are wired into the app: it pulls the top Spry pools from the Spry subgraph via
// @spry/subgraph, and renders each pool's tier and current dynamic fee (formatted
// by @spry/fee). It deliberately uses plain state + the data layer (no react-query
// coupling) so it stays self-contained and easy to remove once real Spry surfaces
// land.
export default function SpryProbe(): JSX.Element {
  const chainId = DEFAULT_CHAIN_ID
  const config = getSpryConfig(chainId)
  const [pools, setPools] = useState<PoolRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run(): Promise<void> {
      try {
        const client = createSpryGraphClientForChain(chainId)
        const result = await fetchPools(client, { first: 10 })
        if (!cancelled) {
          setPools(result)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [chainId])

  return (
    <Flex gap="$gap16" p="$padding24" maxWidth={720} mx="auto" width="100%">
      <Text variant="heading2">Spry live read</Text>
      <Text variant="body2" color="$neutral2">
        chainId {chainId} · subgraph {config?.subgraphUrl ? 'configured' : 'missing'}
      </Text>

      {error ? (
        <Text variant="body2" color="$statusCritical">
          Error: {error}
        </Text>
      ) : pools === null ? (
        <Text variant="body2" color="$neutral2">
          Loading pools from the Spry subgraph…
        </Text>
      ) : pools.length === 0 ? (
        <Text variant="body2" color="$neutral2">
          Connected to the subgraph, but it returned no Spry pools yet.
        </Text>
      ) : (
        <Flex gap="$gap8">
          {pools.map((pool) => (
            <Flex
              key={pool.id}
              row
              alignItems="center"
              justifyContent="space-between"
              gap="$gap12"
              p="$padding16"
              borderWidth={1}
              borderColor="$surface3"
              borderRadius="$rounded12"
            >
              <Text variant="body2">
                {pool.token0.symbol} / {pool.token1.symbol}
              </Text>
              <Text variant="body2" color="$neutral2">
                {pool.tier}
              </Text>
              <Text variant="body2">{formatFeePercent(pool.feeTier)}</Text>
            </Flex>
          ))}
        </Flex>
      )}
    </Flex>
  )
}
