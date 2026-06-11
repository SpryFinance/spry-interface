import { useTranslation } from 'react-i18next'
import { Accordion, Flex, Square, Text } from 'ui/src'
import { RotatableChevron } from 'ui/src/components/icons/RotatableChevron'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { MenuLink } from '~/components/NavBar/CompanyMenu/MenuDropdown'
import { NavDropdown } from '~/components/NavBar/NavDropdown'
import { useTabsContent } from '~/components/NavBar/Tabs/TabsContent'

function MenuSection({
  title,
  children,
  collapsible = true,
}: {
  title: string
  children: JSX.Element | JSX.Element[]
  collapsible?: boolean
}) {
  return (
    <Accordion.Item value={title} disabled={!collapsible}>
      <Flex gap="8px">
        <Accordion.Trigger flexDirection="row" p="0" gap="4px">
          {({ open }: { open: boolean }) => (
            <>
              <Text variant="body4" color="$neutral2">
                {title}
              </Text>
              {collapsible && (
                <Square animation="200ms" rotate={open ? '90deg' : '270deg'}>
                  <RotatableChevron size="$icon.16" color="$neutral2" />
                </Square>
              )}
            </>
          )}
        </Accordion.Trigger>
        <Accordion.Content p="0" forceMount={!collapsible || undefined}>
          <Flex gap="8px">{children}</Flex>
        </Accordion.Content>
      </Flex>
    </Accordion.Item>
  )
}

// SPRY: the drawer is app navigation only for the testnet phase, mirroring the desktop chrome (no
// company mega-menu, floating help unmounted via modalRegistry). Removed here: the HelpModal "?"
// (it linked to Uniswap support/docs), Socials, LegalAndPrivacyMenu (ToS/privacy stay reachable from
// the wallet-connect modal and the Landing footer), and the dead language/currency settings views
// (their trigger section was already pruned). Restore those imports + renders to bring any back.
export function MobileMenuDrawer({ isOpen, closeMenu }: { isOpen: boolean; closeMenu: () => void }) {
  const { t } = useTranslation()
  const tabsContent = useTabsContent()

  return (
    <NavDropdown isOpen={isOpen} dataTestId={TestID.CompanyMenuMobileDrawer} borderColor="$surface3">
      <Flex pt="$spacing12" pb="$spacing32" px="$spacing24">
        <Accordion overflow="hidden" width="100%" type="multiple">
          <Flex gap="$spacing20">
            <MenuSection title={t('common.app')} collapsible={false}>
              {tabsContent.map((tab, index) => (
                <MenuLink
                  key={`${tab.title}_${index}}`}
                  label={tab.title}
                  href={tab.href}
                  internal
                  closeMenu={closeMenu}
                  icon={tab.icon}
                  textVariant="body2"
                  elementName={tab.elementName}
                  comingSoon={tab.comingSoon}
                />
              ))}
            </MenuSection>
          </Flex>
        </Accordion>
      </Flex>
    </NavDropdown>
  )
}
