import { useEffect, useState } from 'react'
import { Flex, Text } from 'ui/src'
import { colors } from 'ui/src/theme/color/colors'
import { SpryGradientText } from 'uniswap/src/features/transactions/swap/components/SprySwapHelp/SpryGradientText'

type IconProps = { active: boolean }

function strokeColor(active: boolean): string {
  return active ? colors.white : colors.spryLilac
}

function PairIcon({ active }: IconProps): JSX.Element {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={strokeColor(active)} strokeWidth={1.8}>
      <circle cx={9} cy={12} r={6} />
      <circle cx={15} cy={12} r={6} />
    </svg>
  )
}

function QuoteIcon({ active }: IconProps): JSX.Element {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor(active)}
      strokeWidth={1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  )
}

function FeeCurveIcon({ active }: IconProps): JSX.Element {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor(active)}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 17c4 0 5-10 9-10s5 6 9 6" />
    </svg>
  )
}

function ConfirmIcon({ active }: IconProps): JSX.Element {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor(active)}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  )
}

interface Step {
  title: string
  desc: string
  Icon: (props: IconProps) => JSX.Element
}

const STEPS: Step[] = [
  { title: 'Choose your pair', desc: 'Pick the two tokens you want to trade from the selector.', Icon: PairIcon },
  { title: 'Get a live quote', desc: 'Spry prices the trade on-chain for an exact, up-to-the-block rate.', Icon: QuoteIcon },
  {
    title: 'Spry sets the fee',
    desc: 'The fee flexes with volatility and pool balance, then eases back to the base. No fixed tier.',
    Icon: FeeCurveIcon,
  },
  { title: 'Confirm in your wallet', desc: 'Sign once and the swap settles on-chain in a second or two.', Icon: ConfirmIcon },
]

const STEP_INTERVAL_MS = 2600

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const onChange = (e: MediaQueryListEvent): void => setReduce(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduce
}

// CSS keyframes for the active badge pulse. framer-motion is not a packages/uniswap
// dependency, so the explainer renders this once via a <style> tag (web-only modal).
const BADGE_PULSE_KEYFRAMES = `@keyframes sprySwapBadgePulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 14px ${colors.spryViolet}55; }
  50% { transform: scale(1.1); box-shadow: 0 0 28px ${colors.spryViolet}aa; }
}`

function StepBadge({
  active,
  reduceMotion,
  Icon,
}: {
  active: boolean
  reduceMotion: boolean
  Icon: (p: IconProps) => JSX.Element
}): JSX.Element {
  // Active badge pulses (scale + glow). Holds a static glow under reduced motion.
  const activeStyle = reduceMotion
    ? { boxShadow: `0 0 20px ${colors.spryViolet}66`, transform: 'scale(1.04)' }
    : { animation: 'sprySwapBadgePulse 1.5s ease-in-out infinite' }
  return (
    <Flex
      width={40}
      height={40}
      borderRadius="$rounded12"
      alignItems="center"
      justifyContent="center"
      borderWidth={1}
      backgroundColor={active ? '$accent1' : 'rgba(137, 54, 255, 0.10)'}
      borderColor={active ? '$accent1' : 'rgba(137, 54, 255, 0.35)'}
      style={active ? activeStyle : undefined}
    >
      <Icon active={active} />
    </Flex>
  )
}

/**
 * SPRY: an animated "how a swap works" explainer. Four steps (pair -> live quote
 * -> dynamic fee -> confirm) with a gently cycling violet highlight, brand
 * gradient heading, and the spry.fi glow treatment. Rendered as bare content
 * inside the help modal (see SprySwapHelpButton), which supplies the surface and
 * padding. The highlight holds still under prefers-reduced-motion.
 */
export function SprySwapExplainer(): JSX.Element {
  const reduceMotion = usePrefersReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (reduceMotion) {
      return undefined
    }
    const id = setInterval(() => setActiveIndex((i) => (i + 1) % STEPS.length), STEP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [reduceMotion])

  return (
    // No overflow:hidden - it clipped the active badge glow on the left-column steps.
    <Flex position="relative" gap="$spacing16">
      <style>{BADGE_PULSE_KEYFRAMES}</style>
      {/* soft violet bloom behind the title (full width, centered, no hard edges) */}
      <Flex
        position="absolute"
        top={-24}
        left={0}
        right={0}
        height={150}
        pointerEvents="none"
        style={{ background: `radial-gradient(ellipse 58% 78% at 50% 12%, ${colors.spryViolet}3D, transparent 72%)` }}
      />

      <Flex gap="$spacing4" zIndex={1}>
        <SpryGradientText variant="subheading1">How a Spry swap works</SpryGradientText>
        <Text variant="body3" color="$neutral2">
          From pair to settled in four steps. Spry prices every trade on-chain and sets the fee live.
        </Text>
      </Flex>

      <Flex row flexWrap="wrap" rowGap="$spacing20" justifyContent="space-between" zIndex={1}>
        {STEPS.map((step, i) => (
          <Flex key={step.title} width="47%" minWidth={150} gap="$spacing8">
            <Flex row alignItems="center" gap="$spacing8">
              <StepBadge active={i === activeIndex} reduceMotion={reduceMotion} Icon={step.Icon} />
              <Text variant="body4" color={i === activeIndex ? '$accent1' : '$neutral3'}>
                Step {i + 1}
              </Text>
            </Flex>
            <Text variant="subheading2" color="$neutral1">
              {step.title}
            </Text>
            <Text variant="body4" color="$neutral2">
              {step.desc}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  )
}
