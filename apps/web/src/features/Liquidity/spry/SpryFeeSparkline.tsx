import { tierInfo, type PoolTier } from '@spry/fee'
import { createSpryGraphClientForChain, fetchPoolSwaps } from '@spry/subgraph'
import { useQuery } from '@tanstack/react-query'
import type { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { useMemo } from 'react'
import { Flex, useSporeColors } from 'ui/src'
import type { UniverseChainId } from 'uniswap/src/features/chains/types'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
} from '~/features/Liquidity/charts/LiquidityPositionRangeChart/LiquidityPositionRangeChart'
import { getLineColor, SPARKLINE_PADDING } from '~/features/Liquidity/charts/LiquidityPositionSparkline'

const SWAPS_TO_PLOT = 50

/**
 * A smooth cubic-bezier path through the value points (Catmull-Rom converted to
 * bezier control points), instead of the jagged straight segments of the stock
 * sparkline. Control-point ys are clamped so curve overshoot stays in frame.
 */
function buildSmoothSparklinePath(
  values: number[],
  opts: { width: number; height: number; minVal: number; maxVal: number },
): string {
  const { width, height, minVal, maxVal } = opts
  const range = maxVal - minVal || 1
  const padded = height - SPARKLINE_PADDING * 2
  const step = width / (values.length - 1)
  const points = values.map((value, i): [number, number] => [
    i * step,
    SPARKLINE_PADDING + padded - ((value - minVal) / range) * padded,
  ])

  const clampY = (y: number): number => Math.min(Math.max(y, 0.5), height - 0.5)
  const fmt = (n: number): string => n.toFixed(1)

  let path = `M${fmt(points[0]?.[0] ?? 0)},${fmt(points[0]?.[1] ?? 0)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as [number, number]
    const p1 = points[i] as [number, number]
    const p2 = points[i + 1] as [number, number]
    const p3 = points[Math.min(points.length - 1, i + 2)] as [number, number]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6)
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6)
    path += ` C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2[0])},${fmt(p2[1])}`
  }
  return path
}

/**
 * SPRY: the position card sparkline for Spry pools. The gateway price history the
 * stock sparkline draws from does not exist on testnet, so this plots the pool's
 * DYNAMIC FEE across its recent swaps instead - the trajectory that produced the
 * accrued fees shown on the card. Pools with no swaps yet draw flat at the tier's
 * base fee, so every position gets a line.
 */
export function SpryFeeSparkline({
  poolId,
  chainId,
  tier,
  positionStatus,
}: {
  poolId: string
  chainId: UniverseChainId
  tier: PoolTier
  positionStatus?: PositionStatus
}): JSX.Element {
  const colors = useSporeColors()

  const { data: swaps } = useQuery({
    queryKey: ['sprySparklineSwaps', chainId, poolId],
    queryFn: async () => {
      const client = createSpryGraphClientForChain(chainId)
      return fetchPoolSwaps(client, { pool: poolId, first: SWAPS_TO_PLOT })
    },
    staleTime: 60_000,
  })

  const sparkline = useMemo(() => {
    const baseFee = tierInfo(tier).baseFeePips
    // swaps arrive newest-first; plot chronologically. No swaps -> flat at base fee.
    const fees = (swaps ?? [])
      .map((swap) => Number(swap.fee))
      .filter((fee) => Number.isFinite(fee))
      .reverse()
    const values = fees.length >= 2 ? fees : [baseFee, ...fees, fees[fees.length - 1] ?? baseFee]

    // Anchor the scale at the tier base so a fee spike reads as a rise from rest.
    const minVal = Math.min(...values, baseFee)
    const maxVal = Math.max(...values)
    const path = buildSmoothSparklinePath(values, { width: CHART_WIDTH, height: CHART_HEIGHT, minVal, maxVal })

    const range = maxVal - minVal || 1
    const padded = CHART_HEIGHT - SPARKLINE_PADDING * 2
    const lastVal = values[values.length - 1] ?? baseFee
    const lastY = SPARKLINE_PADDING + padded - ((lastVal - minVal) / range) * padded

    return { path, lastX: CHART_WIDTH - 3, lastY }
  }, [swaps, tier])

  const lineColor = getLineColor(positionStatus, colors)

  return (
    <Flex height={CHART_HEIGHT} width={CHART_WIDTH} $md={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <line
          x1={0}
          y1={sparkline.lastY}
          x2={CHART_WIDTH}
          y2={sparkline.lastY}
          stroke={lineColor}
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        <path
          d={sparkline.path}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={sparkline.lastX} cy={sparkline.lastY} r={3} fill={lineColor} />
      </svg>
    </Flex>
  )
}
