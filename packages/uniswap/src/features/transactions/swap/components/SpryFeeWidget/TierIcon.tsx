import { PoolTier } from '@spry/fee'
import { Circle, Path, Rect, Svg } from 'react-native-svg'

/**
 * A distinct glyph per Spry tier, risk-ascending: STABLE (level bars / pegged),
 * LIKE_ASSET (paired discs / wrapped assets), BLUE_CHIP (a gem), VOLATILE
 * (ascending bars / price swings), EXOTIC (a sparkle / long-tail). Drawn in a
 * 24x24 viewBox, filled with `color`.
 */
const GLYPHS: Record<PoolTier, (color: string) => JSX.Element> = {
  [PoolTier.STABLE]: (color) => (
    <>
      <Rect x={4} y={8} width={16} height={3} rx={1.5} fill={color} />
      <Rect x={4} y={13} width={16} height={3} rx={1.5} fill={color} />
    </>
  ),
  [PoolTier.LIKE_ASSET]: (color) => (
    <>
      <Circle cx={9} cy={12} r={5} fill={color} opacity={0.6} />
      <Circle cx={15} cy={12} r={5} fill={color} opacity={0.6} />
    </>
  ),
  [PoolTier.BLUE_CHIP]: (color) => <Path d="M12 2 L21 12 L12 22 L3 12 Z" fill={color} />,
  [PoolTier.VOLATILE]: (color) => (
    <>
      <Rect x={4} y={13} width={3.5} height={7} rx={1} fill={color} />
      <Rect x={10.25} y={9} width={3.5} height={11} rx={1} fill={color} />
      <Rect x={16.5} y={5} width={3.5} height={15} rx={1} fill={color} />
    </>
  ),
  [PoolTier.EXOTIC]: (color) => (
    <Path d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z" fill={color} />
  ),
}

export function TierIcon({ tier, size = 16, color }: { tier: PoolTier; size?: number; color: string }): JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {GLYPHS[tier](color)}
    </Svg>
  )
}
