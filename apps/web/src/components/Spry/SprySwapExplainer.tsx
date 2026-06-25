import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Flex, Text } from 'ui/src'
import { colors } from 'ui/src/theme/color/colors'
import { SpryGradientText } from '~/components/Spry/SpryGradientText'

type IconProps = { active: boolean }

function PairIcon({ active }: IconProps): JSX.Element {
  const c = active ? colors.white : colors.spryLilac
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8}>
      <circle cx={9} cy={12} r={6} />
      <circle cx={15} cy={12} r={6} />
    </svg>
  )
}

function QuoteIcon({ active }: IconProps): JSX.Element {
  const c = active ? colors.white : colors.spryLilac
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  )
}

function FeeCurveIcon({ active }: IconProps): JSX.Element {
  const c = active ? colors.white : colors.spryLilac
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c4 0 5-10 9-10s5 6 9 6" />
    </svg>
  )
}

function ConfirmIcon({ active }: IconProps): JSX.Element {
  const c = active ? colors.white : colors.spryLilac
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
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

function StepBadge({ active, Icon }: { active: boolean; Icon: (p: IconProps) => JSX.Element }): JSX.Element {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      animate={active && !reduceMotion ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 1.4, repeat: active && !reduceMotion ? Infinity : 0, ease: 'easeInOut' }}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? colors.spryViolet : 'rgba(137,54,255,0.10)',
        border: `1px solid ${active ? colors.spryViolet : 'rgba(137,54,255,0.35)'}`,
        boxShadow: active ? `0 0 22px ${colors.spryViolet}66` : 'none',
        transition: 'background 300ms ease, box-shadow 300ms ease, border-color 300ms ease',
      }}
    >
      <Icon active={active} />
    </motion.div>
  )
}

/**
 * SPRY: an animated "how a swap works" explainer for the Swap page. Four steps
 * (pair -> live quote -> dynamic fee -> confirm) with a gently cycling violet
 * highlight, brand gradient heading, and the spry.fi glow treatment. Decorative
 * and educational; the highlight holds still under prefers-reduced-motion.
 */
export function SprySwapExplainer(): JSX.Element {
  const reduceMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (reduceMotion) {
      return undefined
    }
    const id = setInterval(() => setActiveIndex((i) => (i + 1) % STEPS.length), STEP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [reduceMotion])

  return (
    <Flex
      position="relative"
      overflow="hidden"
      mt="$spacing12"
      p="$spacing20"
      gap="$spacing16"
      borderWidth={1}
      borderColor="$accent2"
      borderRadius="$rounded20"
      backgroundColor="$surface1"
    >
      {/* faint violet glow bleeding in from the top edge */}
      <Flex
        position="absolute"
        top={-80}
        left={0}
        right={0}
        height={160}
        pointerEvents="none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${colors.spryViolet}33, transparent 70%)` }}
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
              <StepBadge active={i === activeIndex} Icon={step.Icon} />
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
