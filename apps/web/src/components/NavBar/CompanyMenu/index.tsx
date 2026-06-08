import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Flex, Popover, styled, Text, useMedia } from 'ui/src'
import { ArrowChange } from 'ui/src/components/icons/ArrowChange'
import { Hamburger } from 'ui/src/components/icons/Hamburger'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { NavIcon } from '~/components/Logo/NavIcon'
import { MobileMenuDrawer } from '~/components/NavBar/CompanyMenu/MobileMenuDrawer'
import { useIsMobileDrawer } from '~/components/NavBar/ScreenSizes'

const ArrowDownWrapper = styled(Text, {
  color: '$neutral2',
  '$group-hover': { color: '$neutral1' },
  variants: {
    open: {
      true: { color: '$neutral1' },
    },
  },
})

export function CompanyMenu() {
  const popoverRef = useRef<Popover>(null)
  const media = useMedia()
  const isMobileDrawer = useIsMobileDrawer()
  const isLargeScreen = !media.xxl
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)

  const closeMenu = useCallback(() => {
    popoverRef.current?.close()
  }, [popoverRef])
  useEffect(() => {
    // Immediately reset state to prevent flash during transitions
    setIsOpen(false)
    closeMenu()
  }, [location, closeMenu])

  const brandLogo = (
    <Trace logPress element={ElementName.NavbarCompanyMenuLogo}>
      <Link to="/?intro=true" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}>
        <Flex row alignItems="center" gap="$gap4" data-testid={TestID.NavUniswapLogo}>
          <NavIcon />
          {isLargeScreen && (
            <Text variant="subheading1" color="$accent1" userSelect="none">
              Spry
            </Text>
          )}
        </Flex>
      </Link>
    </Trace>
  )

  // SPRY: drop the Uniswap "company" mega-menu. On desktop the brand mark is just a
  // home link. On mobile we keep the popover, because its drawer is the primary
  // mobile navigation (the app tabs live there), not a marketing menu.
  if (!isMobileDrawer) {
    return brandLogo
  }

  return (
    <Popover ref={popoverRef} placement="bottom" hoverable={!media.xl} stayInFrame allowFlip onOpenChange={setIsOpen}>
      <Popover.Trigger data-testid={TestID.NavCompanyMenu}>
        <Flex
          row
          alignItems="center"
          gap="$gap4"
          p="$spacing8"
          cursor="pointer"
          group
          $platform-web={{ containerType: 'normal' }}
        >
          {brandLogo}
          {media.md && <Hamburger size={22} color="$neutral2" cursor="pointer" ml="16px" />}
          {!media.md && (
            <ArrowDownWrapper open={isOpen}>
              <ArrowChange size="$icon.12" />
            </ArrowDownWrapper>
          )}
        </Flex>
      </Popover.Trigger>
      <MobileMenuDrawer isOpen={isOpen} closeMenu={closeMenu} />
    </Popover>
  )
}
