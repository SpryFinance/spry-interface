import { SVGProps } from 'react'
import { Flex, styled, Text } from 'ui/src'

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

// SPRY: brand wordmark in place of the Uniswap unicorn logo.
export const NavIcon = ({ clickable, onClick }: NavIconProps) => {
  return (
    <Container clickable={clickable} onPress={onClick}>
      <Text variant="heading3" color="$accent1" cursor="pointer">
        Spry
      </Text>
    </Container>
  )
}
