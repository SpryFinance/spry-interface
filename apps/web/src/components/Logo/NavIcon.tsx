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

type NavIconProps = {
  clickable?: boolean
  onClick?: () => void
}

const SPRY_LOGO_SIZE = 28

// SPRY: the brand mark (sprout + sun over waves inside a ring), shipped as the
// user's own artwork at apps/web/public/spry-logo.png. The logo shape is carried
// in the PNG's alpha channel, so we paint it through a CSS mask filled with the
// theme foreground color: white in dark mode, near-black in light mode. That
// keeps the exact artwork while staying theme-aware and crisp at any DPI.
export const NavIcon = ({ clickable, onClick }: NavIconProps) => {
  const colors = useSporeColors()

  return (
    <Container clickable={clickable}>
      {/* A raw masked element is required here: the mark is recolored to the theme
          foreground via a CSS mask, which Tamagui/react-native-web style props can't express. */}
      {/* oxlint-disable-next-line react/forbid-elements */}
      <div
        role="img"
        aria-label="Spry"
        onClick={onClick}
        style={{
          width: SPRY_LOGO_SIZE,
          height: SPRY_LOGO_SIZE,
          backgroundColor: colors.neutral1.val,
          maskImage: 'url(/spry-logo.png)',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskImage: 'url(/spry-logo.png)',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          WebkitMaskSize: 'contain',
        }}
      />
    </Container>
  )
}
