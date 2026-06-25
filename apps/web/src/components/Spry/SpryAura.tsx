import { motion, useReducedMotion } from 'framer-motion'
import { memo } from 'react'
import { Flex } from 'ui/src'
import { colors } from 'ui/src/theme/color/colors'

const VIOLET = colors.spryViolet
const GRAPE = colors.spryGrape
const MINT = colors.spryMint

interface AuraBlob {
  size: number
  css: React.CSSProperties
  color: string
  alpha: string
  animate: Record<string, number[]>
  duration: number
}

// Three blurred radial "blobs" that slowly drift and breathe, ported from the
// spry.fi landing black-hole glow: a dominant violet core, a grape companion,
// and a faint mint highlight.
const BLOBS: AuraBlob[] = [
  {
    size: 820,
    color: VIOLET,
    alpha: '80',
    css: { top: '-6%', left: '50%', transform: 'translateX(-50%)' },
    animate: { scale: [1, 1.18, 1], opacity: [0.45, 0.75, 0.45], y: [0, 26, 0] },
    duration: 11,
  },
  {
    size: 560,
    color: GRAPE,
    alpha: '40',
    css: { bottom: '-18%', left: '12%' },
    animate: { scale: [1.06, 1, 1.06], opacity: [0.3, 0.5, 0.3], x: [0, 34, 0] },
    duration: 15,
  },
  {
    size: 420,
    color: MINT,
    alpha: '22',
    css: { top: '22%', right: '4%' },
    animate: { scale: [1, 1.14, 1], opacity: [0.15, 0.35, 0.15] },
    duration: 18,
  },
]

/**
 * SPRY: an ambient violet "aura" background ported from the spry.fi landing
 * (the black-hole glow). Blurred radial blobs drift and breathe behind the page
 * content so the app reads as one piece with the marketing site. Decorative
 * only: pointer-events none, behind content (zIndex 0), and static when the user
 * prefers reduced motion.
 *
 * Defaults to a fixed, full-viewport layer (so it bleeds past narrow page
 * wrappers like the 480px swap card); pass `contained` to clip it to the nearest
 * positioned ancestor instead.
 */
export const SpryAura = memo(function SpryAura({ contained = false }: { contained?: boolean }): JSX.Element {
  const reduceMotion = useReducedMotion()
  return (
    <Flex
      position="absolute"
      // `fixed` (full-viewport bleed) is web-only and not in Tamagui's cross-platform
      // position type, so set it via the web style escape hatch. `contained` keeps it
      // absolute (clipped to the nearest positioned ancestor).
      $platform-web={contained ? undefined : { position: 'fixed' }}
      top={0}
      left={0}
      right={0}
      bottom={0}
      overflow="hidden"
      pointerEvents="none"
      zIndex={0}
      opacity={0.9}
    >
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            width: blob.size,
            height: blob.size,
            borderRadius: '50%',
            background: `radial-gradient(circle at 50% 50%, ${blob.color}${blob.alpha}, transparent 66%)`,
            filter: 'blur(72px)',
            willChange: 'transform, opacity',
            ...blob.css,
          }}
          animate={reduceMotion ? undefined : blob.animate}
          transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </Flex>
  )
})
