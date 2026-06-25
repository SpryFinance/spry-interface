import { Text, type TextProps } from 'ui/src'
import { colors } from 'ui/src/theme/color/colors'

const BRAND_GRADIENT = `linear-gradient(90deg, ${colors.spryMint} 0%, ${colors.spryViolet} 48%, ${colors.spryGrape} 100%)`

/**
 * SPRY: a heading whose fill is the brand mint -> violet -> grape gradient,
 * matching the gradient headings on the spry.fi landing. Web-only background-clip
 * trick; falls back to the violet accent if clipping is unsupported.
 */
export function SpryGradientText({ children, ...props }: TextProps): JSX.Element {
  return (
    <Text
      {...props}
      color="$accent1"
      style={{
        fontFamily: '"Space Grotesk", Basel, system-ui, sans-serif',
        backgroundImage: BRAND_GRADIENT,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
    >
      {children}
    </Text>
  )
}
