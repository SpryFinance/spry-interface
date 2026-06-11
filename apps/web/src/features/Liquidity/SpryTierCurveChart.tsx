import { sampleFeeCurve, TIER_BY_INDEX } from '@spry/fee'
import { Flex, Text, useSporeColors } from 'ui/src'
import { TIER_COLORS } from '~/features/Liquidity/SpryTiersCard'

// Every tier shares dangerHigh = 5000 (the cap boundary), so all five curves share one x-axis.
const X_MAX = 5_000
// Log-scale y-axis: 10^-2 (0.01%, the lowest tier base) at the floor, 10^1 (10%) at the ceiling.
const Y_TOP_DECADE = 1
const Y_BOTTOM_DECADE = -2
const SAMPLE_POINTS = 88

const VIEW_W = 360
const VIEW_H = 230
const PAD_TOP = 12
const PAD_RIGHT = 14
const PAD_BOTTOM = 30
const PAD_LEFT = 42
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM

function xForDelta(delta: number): number {
  return PAD_LEFT + (delta / X_MAX) * PLOT_W
}

function yForDecade(decade: number): number {
  return PAD_TOP + ((Y_TOP_DECADE - decade) / (Y_TOP_DECADE - Y_BOTTOM_DECADE)) * PLOT_H
}

function yForPercent(pct: number): number {
  const clamped = Math.min(Math.max(pct, 10 ** Y_BOTTOM_DECADE), 10 ** Y_TOP_DECADE)
  return yForDecade(Math.log10(clamped))
}

// Static geometry: sample each tier's point-fee curve once on the shared axis (feePips / 10_000 = %).
const TIER_CURVES = TIER_BY_INDEX.map((tier, index) => {
  const path = sampleFeeCurve(tier.tier, { from: 0, to: X_MAX, points: SAMPLE_POINTS })
    .map(
      (sample, i) =>
        `${i === 0 ? 'M' : 'L'}${xForDelta(sample.delta).toFixed(2)} ${yForPercent(sample.feePips / 10_000).toFixed(2)}`,
    )
    .join(' ')
  return { label: tier.label, color: TIER_COLORS[index] ?? '#888888', path }
})

const Y_TICKS = [
  { decade: 1, label: '10%' },
  { decade: 0, label: '1%' },
  { decade: -1, label: '0.1%' },
  { decade: -2, label: '0.01%' },
]

/**
 * SPRY: a comparison chart of all five tier fee curves on one log-scale axis. It replaces the
 * "Learn about liquidity provision" sidebar beside {@link SpryTiersCard}. The y-axis is the LP fee
 * (log scale, 0.01% to 10%); the x-axis is how far a pool has drifted from balance. Each curve sits
 * flat at the tier's base fee, then climbs through the alert and danger zones toward its cap, which
 * is exactly the dynamic-fee behavior the card describes in words.
 */
export function SpryTierCurveChart(): JSX.Element {
  const colors = useSporeColors()
  const gridColor = colors.surface3.val
  const labelColor = colors.neutral3.val

  return (
    <Flex
      gap="$spacing16"
      p="$spacing20"
      borderWidth="$spacing1"
      borderColor="$surface3"
      borderRadius="$rounded20"
      backgroundColor="$surface1"
    >
      <Flex gap="$spacing4">
        <Text variant="subheading2" color="$neutral1">
          Fee curve by tier
        </Text>
        <Text variant="body3" color="$neutral2">
          Each tier's LP fee on a log scale, from its base up to its cap, as a pool drifts away from balance.
        </Text>
      </Flex>

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" role="img" aria-label="Spry fee curve comparison by tier">
        {/* y-axis: log gridlines + fee labels */}
        {Y_TICKS.map(({ decade, label }) => {
          const y = yForDecade(decade)
          return (
            <g key={label}>
              <line x1={PAD_LEFT} y1={y} x2={VIEW_W - PAD_RIGHT} y2={y} stroke={gridColor} strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" fontSize={9} fill={labelColor}>
                {label}
              </text>
            </g>
          )
        })}

        {/* x-axis: balanced (left) to imbalanced (right) */}
        <text x={PAD_LEFT} y={VIEW_H - 8} textAnchor="start" fontSize={9} fill={labelColor}>
          balanced
        </text>
        <text x={VIEW_W - PAD_RIGHT} y={VIEW_H - 8} textAnchor="end" fontSize={9} fill={labelColor}>
          imbalanced →
        </text>

        {/* one polyline per tier */}
        {TIER_CURVES.map((curve) => (
          <path
            key={curve.label}
            d={curve.path}
            fill="none"
            stroke={curve.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* legend: line color to tier, matching the dots in the card */}
      <Flex row flexWrap="wrap" gap="$spacing8">
        {TIER_CURVES.map((curve) => (
          <Flex key={curve.label} row alignItems="center" gap="$spacing6">
            <svg width={14} height={4} viewBox="0 0 14 4" style={{ flexShrink: 0 }}>
              <rect width={14} height={4} rx={2} fill={curve.color} />
            </svg>
            <Text variant="body4" color="$neutral2">
              {curve.label}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  )
}
