import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Flex, Popover, styled, Text } from 'ui/src'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { NavDropdown, NavDropdownTabWrapper } from '~/components/NavBar/NavDropdown/index'
import { TabsItem, TabsSection, useTabsContent } from '~/components/NavBar/Tabs/TabsContent'

const TabText = styled(Text, {
  justifyContent: 'center',
  alignItems: 'center',
  m: '$padding8',
  gap: '$gap4',
  cursor: 'pointer',
  userSelect: 'none',
  color: '$neutral2',
  hoverStyle: { color: '$neutral1' },
  variants: {
    isActive: {
      true: { color: '$neutral1' },
    },
  },
})

interface TItemProps {
  icon?: JSX.Element
  label: string
  path: string
  closeMenu: () => void
  elementName: ElementName
}
function Item({ icon, label, path, closeMenu, elementName }: TItemProps) {
  return (
    <Trace logPress element={elementName}>
      <NavLink to={path} style={{ textDecoration: 'none' }} onClick={closeMenu}>
        <Flex
          row
          alignItems="center"
          p="$padding12"
          gap="$gap8"
          alignSelf="stretch"
          borderRadius="$rounded12"
          backgroundColor="$surface2"
          height="$spacing48"
          hoverStyle={{ backgroundColor: '$surface2Hovered' }}
        >
          {icon}
          <Text variant="buttonLabel2" width="100%" color="$neutral2">
            {label}
          </Text>
        </Flex>
      </NavLink>
    </Trace>
  )
}

const Tab = ({
  label,
  isActive,
  path,
  items,
  elementName,
  comingSoon,
}: {
  label: string
  isActive?: boolean
  path: string
  items?: TabsItem[]
  elementName: ElementName
  comingSoon?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<Popover>(null)
  const location = useLocation()

  const closeMenu = useCallback(() => {
    popoverRef.current?.close()
  }, [popoverRef])
  useEffect(() => closeMenu(), [location, closeMenu])

  // SPRY: a "coming soon" tab renders grayed out and unreachable (no link, no dropdown) with a small
  // "Soon" badge. Drop the `comingSoon` flag in TabsContent.tsx to restore full navigation.
  if (comingSoon) {
    return (
      <Flex position="relative" alignItems="center">
        <TabText variant="subheading1" color="$neutral3" cursor="default" hoverStyle={{ color: '$neutral3' }}>
          {label}
        </TabText>
        <Flex
          position="absolute"
          top={-4}
          right={-2}
          backgroundColor="$statusWarning"
          borderRadius="$rounded4"
          px="$spacing2"
          py="$spacing1"
        >
          <Text variant="body4" fontSize={8} lineHeight={10} fontWeight="600" color="$surface1">
            Soon
          </Text>
        </Flex>
      </Flex>
    )
  }

  const Label = (
    <Trace logPress element={elementName}>
      <NavLink to={path} style={{ textDecoration: 'none' }}>
        <TabText variant="subheading1" isActive={isActive || isOpen}>
          {label}
        </TabText>
      </NavLink>
    </Trace>
  )

  if (!items) {
    return Label
  }

  return (
    <Popover
      ref={popoverRef}
      placement="bottom"
      hoverable={{
        delay: { open: 75, close: 150 },
        restMs: 50,
        move: true,
      }}
      stayInFrame
      allowFlip
      onOpenChange={setIsOpen}
    >
      <Popover.Trigger data-testid={`${label}-tab`}>{Label}</Popover.Trigger>
      <NavDropdown isOpen={isOpen} dataTestId={`${label}-menu`}>
        <NavDropdownTabWrapper>
          {items.map((item, index) => (
            <Item
              key={`${item.label}_${index}`}
              icon={item.icon}
              label={item.label}
              path={item.href}
              closeMenu={closeMenu}
              elementName={item.elementName}
            />
          ))}
        </NavDropdownTabWrapper>
      </NavDropdown>
    </Popover>
  )
}

export function Tabs() {
  const tabsContent: TabsSection[] = useTabsContent()
  return (
    <>
      {tabsContent.map(({ title, isActive, href, items, elementName, comingSoon }, index) => (
        <Tab
          key={`${title}_${index}`}
          label={title}
          isActive={isActive}
          path={href}
          items={items}
          elementName={elementName}
          comingSoon={comingSoon}
        />
      ))}
    </>
  )
}
