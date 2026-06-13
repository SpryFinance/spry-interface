// SPRY: the wallet-positions data source for the Spry chains. The Uniswap
// gateway (ListPositions) does not serve them, so positions are assembled from
// the Spry subgraph + live chain reads instead, per chain:
//
//   1. DISCOVERY (subgraph): which positions belong to this wallet.
//      - NFT positions: `positions(owner)` tracks every ERC-721 minted by the
//        CANONICAL PositionManager (shared by all protocols on the chain, so a
//        tokenId is not necessarily Spry).
//      - Raw positions: liquidity seeded by the spry-contracts scripts goes
//        through the PoolModifyLiquidityTest router with salt = owner address
//        (no NFT). Those are attributed via `modifyLiquidities(origin)` grouped
//        by (pool, ticks, sender), skipping rows whose sender is the
//        PositionManager (those are the NFT positions above).
//   2. IDENTITY (subgraph): `pools(id_in)` returns token metadata + tier for
//      the candidate poolIds, and doubles as the Spry filter: the subgraph
//      indexes only SpryHook pools, so a missing id means "not a Spry pool".
//   3. LIVE STATE (chain, one multicall): PositionManager.getPoolAndPositionInfo
//      resolves each NFT's poolKey + range; StateView.getSlot0/getLiquidity give
//      the live pool price; StateView.getPositionInfo/getFeeGrowthInside give
//      each position's exact liquidity and uncollected fees. Display amounts
//      derive from these via the v4 SDK, so they are correct even after
//      increases/decreases the subgraph cannot attribute per-tokenId.
//
// fetchSpryPositions runs the pipeline for ONE chain; the hook runs it per
// enabled Spry chain and merges. Verified end-to-end against the deployed
// contracts + live Goldsky subgraphs (liquidity sums match StateView exactly
// for both salt schemes). USD valuations are intentionally absent (no price
// oracle on testnet): totalValueUsd/apr stay undefined.

import { getSpryConfig, isSpryChain, SPRY_DEPLOYED_CHAIN_IDS } from '@spry/config'
import { DYNAMIC_FEE_FLAG, type PoolTier } from '@spry/fee'
import {
  createSpryGraphClient,
  fetchModifiesByOrigin,
  fetchPoolsByIds,
  fetchPositionsByOwner,
  type PositionPoolRow,
} from '@spry/subgraph'
import { useQuery } from '@tanstack/react-query'
import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { Currency } from '@uniswap/sdk-core'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { Pool as V4Pool, Position as V4Position } from '@uniswap/v4-sdk'
import { encodePacked, getAddress, keccak256, pad, toHex, type Address, type Hex } from 'viem'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { DYNAMIC_FEE_AMOUNT } from 'uniswap/src/constants/pools'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import type { V4PositionInfo } from 'uniswap/src/features/positions/types'
import { getSpryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { logger } from 'utilities/src/logger/logger'
import {
  POSITION_MANAGER_ABI,
  STATE_VIEW_POSITIONS_ABI,
  toInt24,
} from '~/features/Liquidity/spry/spryPositionsAbi'

const MASK_256 = (1n << 256n) - 1n
const Q128 = 1n << 128n

/** Solidity unchecked subtraction (fee growth deltas wrap mod 2^256). */
function wrappingSub(a: bigint, b: bigint): bigint {
  return (a - b) & MASK_256
}

/**
 * Spry-specific position display data the standard PositionInfo cannot carry:
 * the pool's tier and its fee-curve zone history (counts of swaps that landed
 * in the alert/danger zones).
 */
export interface SpryPositionMeta {
  tier: PoolTier
  alertCount: number
  dangerCount: number
}

/** A V4PositionInfo enriched with Spry display data. */
export type SpryV4PositionInfo = V4PositionInfo & { spry: SpryPositionMeta }

/** The Spry meta attached by useSpryWalletPositions, if this position came from it. */
export function getSpryPositionMeta(position: { poolId: string }): SpryPositionMeta | undefined {
  return (position as Partial<SpryV4PositionInfo>).spry
}

function isZeroAddress(address: string): boolean {
  return areAddressesEqual({
    addressInput1: { address, platform: Platform.EVM },
    addressInput2: { address: ZERO_ADDRESS, platform: Platform.EVM },
  })
}

/** PoolManager position slot id: keccak256(abi.encodePacked(owner, tickLower, tickUpper, salt)). */
function positionId({
  owner,
  tickLower,
  tickUpper,
  salt,
}: {
  owner: Address
  tickLower: number
  tickUpper: number
  salt: Hex
}): Hex {
  return keccak256(encodePacked(['address', 'int24', 'int24', 'bytes32'], [owner, tickLower, tickUpper, salt]))
}

function subgraphTokenToCurrency(
  token: { id: string; symbol: string; name: string; decimals: string },
  chainId: number,
): Currency {
  if (isZeroAddress(token.id)) {
    return nativeOnChain(chainId)
  }
  return new Token(chainId, token.id, Number.parseInt(token.decimals, 10), token.symbol, token.name)
}

/** One position candidate, either an NFT (real tokenId) or a raw seeded position. */
interface Candidate {
  /** Real PositionManager tokenId, or a synthetic stable id for raw positions. */
  tokenId: string
  poolId: string
  tickLower: number
  tickUpper: number
  /** PoolManager-level position owner (PositionManager for NFTs, the seeding router for raw). */
  slotOwner: Address
  /** PoolManager-level salt (tokenId for NFTs, the wallet address for raw). */
  salt: Hex
  /** Pool-key fee. NFTs carry it from the chain; raw Spry pools are always dynamic. */
  keyFee: number
  /** Sort key, newest first. */
  timestamp: number
}

/**
 * The pipeline behind {@link useSpryWalletPositions} for ONE Spry chain;
 * exported for tests and console verification. The hook runs it per enabled
 * chain and merges (each position carries its own chainId).
 */
export async function fetchSpryPositions(owner: Address, chainId: number): Promise<SpryV4PositionInfo[]> {
  const config = getSpryConfig(chainId)
  if (!config?.subgraphUrl) {
    return []
  }
  const graph = createSpryGraphClient(config.subgraphUrl)
  const client = getSpryPublicClient(chainId)
  const positionManager = config.addresses.positionManager
  const stateView = config.addresses.stateView

  // 1. discovery: NFT tokenIds + raw (script-seeded) liquidity, both by wallet
  const [nftRows, modifyRows] = await Promise.all([
    fetchPositionsByOwner(graph, { owner }),
    fetchModifiesByOrigin(graph, { origin: owner }),
  ])

  // 2. resolve every owned tokenId's poolKey + range on-chain (the subgraph
  //    Position entity is pool-agnostic). Burned/foreign tokens resolve to a
  //    zero key whose poolId matches no Spry pool, so they fall out naturally.
  const nftCandidates: Candidate[] = []
  if (nftRows.length > 0) {
    const infoResults = await client.multicall({
      contracts: nftRows.map((row) => ({
        address: positionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: 'getPoolAndPositionInfo' as const,
        args: [BigInt(row.tokenId)] as const,
      })),
      allowFailure: true,
    })
    nftRows.forEach((row, i) => {
      const result = infoResults[i]
      if (result.status !== 'success') {
        return // burned mid-flight or RPC hiccup for this one token; skip
      }
      const [poolKey, packedInfo] = result.result
      const v4PoolId = V4Pool.getPoolId(
        // getPoolId only reads addresses/decimals off the currencies, so cheap stand-ins are fine here.
        isZeroAddress(poolKey.currency0) ? nativeOnChain(chainId) : new Token(chainId, poolKey.currency0, 18),
        isZeroAddress(poolKey.currency1) ? nativeOnChain(chainId) : new Token(chainId, poolKey.currency1, 18),
        poolKey.fee,
        poolKey.tickSpacing,
        poolKey.hooks,
      )
      nftCandidates.push({
        tokenId: row.tokenId,
        // oxlint-disable-next-line universe-custom/no-tolowercase-address-currencyid -- bytes32 poolId (not an address), normalized to match subgraph Pool.id casing
        poolId: v4PoolId.toLowerCase(),
        tickLower: toInt24(packedInfo >> 8n),
        tickUpper: toInt24(packedInfo >> 32n),
        slotOwner: positionManager,
        salt: pad(toHex(BigInt(row.tokenId)), { size: 32 }),
        keyFee: poolKey.fee,
        timestamp: Number(row.createdAtTimestamp),
      })
    })
  }

  // 3. group raw rows by (pool, ticks, sender); the PositionManager's own rows
  //    are the NFT positions already handled above.
  const rawGroups = new Map<string, Candidate>()
  for (const row of modifyRows) {
    const senderIsPositionManager = areAddressesEqual({
      addressInput1: { address: row.sender, platform: Platform.EVM },
      addressInput2: { address: positionManager, platform: Platform.EVM },
    })
    if (senderIsPositionManager) {
      continue
    }
    const tickLower = Number(row.tickLower)
    const tickUpper = Number(row.tickUpper)
    // subgraph values are already lowercase hex, so they key deterministically as-is
    const key = `${row.pool.id}|${tickLower}|${tickUpper}|${row.sender}`
    const existing = rawGroups.get(key)
    const timestamp = Number(row.timestamp)
    if (existing) {
      existing.timestamp = Math.max(existing.timestamp, timestamp)
      continue
    }
    rawGroups.set(key, {
      tokenId: `spry-raw-${key}`,
      poolId: row.pool.id.toLowerCase(),
      tickLower,
      tickUpper,
      slotOwner: getAddress(row.sender),
      salt: pad(owner, { size: 32 }), // the seeding scripts use salt = bytes32(uint160(owner))
      keyFee: DYNAMIC_FEE_FLAG,
      timestamp,
    })
  }

  // newest first; assembly below preserves this order
  const candidates = [...nftCandidates, ...rawGroups.values()].sort((a, b) => b.timestamp - a.timestamp)
  if (candidates.length === 0) {
    return []
  }

  // 4. pool identity + Spry filter: only SpryHook pools are indexed.
  const poolIds = [...new Set(candidates.map((c) => c.poolId))]
  const pools = await fetchPoolsByIds(graph, poolIds)
  const poolById = new Map<string, PositionPoolRow>(pools.map((p) => [p.id.toLowerCase(), p]))
  const spryCandidates = candidates.filter((c) => poolById.has(c.poolId))
  if (spryCandidates.length === 0) {
    return []
  }

  // 5. live state, one multicall: pool slot0 + liquidity, and per position the
  //    exact liquidity + fee-growth checkpoints and the current fee growth inside
  //    its range. Any pool-level failure poisons the result (throw -> the UI
  //    error state with retry) rather than rendering wrong numbers.
  const sprysPoolIds = [...new Set(spryCandidates.map((c) => c.poolId))]
  const poolCalls = sprysPoolIds.flatMap((id) => [
    { address: stateView, abi: STATE_VIEW_POSITIONS_ABI, functionName: 'getSlot0' as const, args: [id as Hex] as const },
    {
      address: stateView,
      abi: STATE_VIEW_POSITIONS_ABI,
      functionName: 'getLiquidity' as const,
      args: [id as Hex] as const,
    },
  ])
  const positionCalls = spryCandidates.flatMap((c) => [
    {
      address: stateView,
      abi: STATE_VIEW_POSITIONS_ABI,
      functionName: 'getPositionInfo' as const,
      args: [
        c.poolId as Hex,
        positionId({ owner: c.slotOwner, tickLower: c.tickLower, tickUpper: c.tickUpper, salt: c.salt }),
      ] as const,
    },
    {
      address: stateView,
      abi: STATE_VIEW_POSITIONS_ABI,
      functionName: 'getFeeGrowthInside' as const,
      args: [c.poolId as Hex, c.tickLower, c.tickUpper] as const,
    },
  ])
  const stateResults = await client.multicall({
    contracts: [...poolCalls, ...positionCalls],
    allowFailure: true,
  })
  const failed = stateResults.find((r) => r.status !== 'success')
  if (failed) {
    throw new Error(`Spry positions: StateView multicall failed (${String(failed.error)})`)
  }

  const slot0ByPool = new Map<string, { sqrtPriceX96: bigint; tick: number; poolLiquidity: bigint }>()
  sprysPoolIds.forEach((id, i) => {
    const slot0 = stateResults[i * 2].result as readonly [bigint, number, number, number]
    const poolLiquidity = stateResults[i * 2 + 1].result as bigint
    slot0ByPool.set(id, { sqrtPriceX96: slot0[0], tick: slot0[1], poolLiquidity })
  })

  // 6. assemble V4PositionInfo objects (mirrors parseRestPosition's v4 branch)
  const out: SpryV4PositionInfo[] = []
  spryCandidates.forEach((candidate, i) => {
    const pool = poolById.get(candidate.poolId)
    const slot0 = slot0ByPool.get(candidate.poolId)
    if (!pool || !slot0) {
      return
    }
    const base = poolCalls.length + i * 2
    const [liquidity, feeGrowthInside0Last, feeGrowthInside1Last] = stateResults[base].result as readonly [
      bigint,
      bigint,
      bigint,
    ]
    const [feeGrowthInside0, feeGrowthInside1] = stateResults[base + 1].result as readonly [bigint, bigint]

    const currency0 = subgraphTokenToCurrency(pool.token0, chainId)
    const currency1 = subgraphTokenToCurrency(pool.token1, chainId)
    const tickSpacing = Number.parseInt(pool.tickSpacing, 10)
    const isDynamic = candidate.keyFee === DYNAMIC_FEE_FLAG

    const v4Pool = new V4Pool(
      currency0,
      currency1,
      candidate.keyFee,
      tickSpacing,
      pool.hooks,
      slot0.sqrtPriceX96.toString(),
      slot0.poolLiquidity.toString(),
      slot0.tick,
    )
    // Cross-check the reconstructed key against the subgraph poolId; a mismatch
    // means a field drifted (wrong fee/tickSpacing/hook) and the position would
    // render with wrong math, so skip and log instead.
    if (V4Pool.getPoolId(currency0, currency1, candidate.keyFee, tickSpacing, pool.hooks).toLowerCase() !== candidate.poolId) {
      logger.error(new Error('Spry positions: poolId mismatch, skipping position'), {
        tags: { file: 'useSpryWalletPositions.ts', function: 'fetchSpryPositions' },
        extra: { poolId: candidate.poolId, tokenId: candidate.tokenId },
      })
      return
    }

    const sdkPosition = new V4Position({
      pool: v4Pool,
      liquidity: liquidity.toString(),
      tickLower: candidate.tickLower,
      tickUpper: candidate.tickUpper,
    })
    const uncollected0 = (liquidity * wrappingSub(feeGrowthInside0, feeGrowthInside0Last)) / Q128
    const uncollected1 = (liquidity * wrappingSub(feeGrowthInside1, feeGrowthInside1Last)) / Q128

    out.push({
      version: ProtocolVersion.V4,
      status: liquidity > 0n ? PositionStatus.IN_RANGE : PositionStatus.CLOSED,
      chainId,
      poolId: candidate.poolId,
      tokenId: candidate.tokenId,
      tickLower: candidate.tickLower,
      tickUpper: candidate.tickUpper,
      tickSpacing,
      liquidity: liquidity.toString(),
      poolOrPair: v4Pool,
      position: sdkPosition,
      feeTier: {
        feeAmount: isDynamic ? DYNAMIC_FEE_AMOUNT : candidate.keyFee,
        tickSpacing,
        isDynamic,
      },
      v4hook: pool.hooks,
      owner,
      currency0Amount: sdkPosition.amount0,
      currency1Amount: sdkPosition.amount1,
      token0UncollectedFees: uncollected0.toString(),
      token1UncollectedFees: uncollected1.toString(),
      fee0Amount: CurrencyAmount.fromRawAmount(currency0, uncollected0.toString()),
      fee1Amount: CurrencyAmount.fromRawAmount(currency1, uncollected1.toString()),
      isHidden: false,
      spry: {
        tier: pool.tier,
        alertCount: Number(pool.alertCount),
        dangerCount: Number(pool.dangerCount),
      },
    })
  })

  return out
}

export interface UseSpryWalletPositionsResult {
  positions: V4PositionInfo[]
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Wallet positions for Spry chains, from the Spry subgraph + live chain reads.
 * A specific chain filter queries that chain; "all chains" (null) queries every
 * Spry-deployed chain and merges. Returns every position (open and closed);
 * apply status/version filters at the call site so filter toggles do not refetch.
 */
export function useSpryWalletPositions({
  address,
  chainFilter,
}: {
  address: string | undefined
  chainFilter: UniverseChainId | null
}): UseSpryWalletPositionsResult {
  // Target the filtered Spry chain, or every Spry-deployed chain when unfiltered.
  const targetChains = (chainFilter === null ? SPRY_DEPLOYED_CHAIN_IDS : isSpryChain(chainFilter) ? [chainFilter] : [])
    .filter((chainId) => !!getSpryConfig(chainId)?.subgraphUrl)
  const enabled = !!address && targetChains.length > 0

  const query = useQuery({
    queryKey: [
      'spryWalletPositions',
      targetChains.join(','),
      address ? normalizeTokenAddressForCache(address) : undefined,
    ],
    // enabled gates on address; getAddress also validates (throws loudly on a bad value).
    queryFn: async () => {
      const owner = getAddress(address ?? '')
      // each position carries its own chainId, so per-chain results merge cleanly
      const perChain = await Promise.all(targetChains.map((chainId) => fetchSpryPositions(owner, chainId)))
      return perChain.flat()
    },
    enabled,
    staleTime: 30_000,
    // PositionInfo holds SDK class instances; structural sharing would walk them pointlessly.
    structuralSharing: false,
  })

  return {
    positions: enabled ? (query.data ?? []) : [],
    isLoading: enabled && query.isLoading,
    isFetching: enabled && query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
