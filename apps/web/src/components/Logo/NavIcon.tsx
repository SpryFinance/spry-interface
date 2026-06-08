import { SVGProps } from 'react'
import { Flex, styled, useSporeColors } from 'ui/src'

const Container = styled(Flex, {
  position: 'relative',
  justifyContent: 'center',
  alignItems: 'center',
  cursor: 'auto',
  variants: {
    clickable: {
      true: { cursor: 'pointer' },
    },
  },
})

type NavIconProps = SVGProps<SVGSVGElement> & {
  clickable?: boolean
  onClick?: () => void
}

// SPRY: the brand mark - a sprout + sun over waves inside a ring. Recreated as a
// theme-aware SVG (uses the foreground color, crisp at any size).
function SpryLogo({ color, onClick }: { color: string; onClick?: () => void }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
      cursor="pointer"
      aria-label="Spry"
    >
      <circle cx="50" cy="50" r="45" stroke={color} strokeWidth="3.5" fill="none" />
      <circle cx="63" cy="34" r="7" fill={color} />
      <path d="M50 72 C 49 63 49 55 50 46" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M49 58 C 39 55 33 46 35 38 C 43 41 49 50 49 58 Z" fill={color} />
      <path d="M50 55 C 57 52 62 46 63 41 C 56 43 51 48 50 55 Z" fill={color} />
      <path d="M15 64 Q 27 58 39 64 T 63 64 T 86 64" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M17 72 Q 30 66 43 72 T 69 72 T 86 70" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export const NavIcon = ({ clickable, onClick }: NavIconProps) => {
  const colors = useSporeColors()

  return (
    <Container clickable={clickable}>
      <SpryLogo color={colors.neutral1.val} onClick={onClick} />
    </Container>
  )
}
