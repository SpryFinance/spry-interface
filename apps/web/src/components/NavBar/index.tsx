import { Flex, styled, Nav } from 'ui/src'
import { INTERFACE_NAV_HEIGHT, zIndexes } from 'ui/src/theme'
import { useConnectionStatus } from 'uniswap/src/features/accounts/store/hooks'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { CompanyMenu } from '~/components/NavBar/CompanyMenu'
// SPRY: the Uniswap "Get the app" wallet-download CTA is hidden (restore these imports + the usage below).
// import { FeatureFlags, useFeatureFlag } from '@universe/gating'
// import { useMedia } from 'ui/src'
// import { NewUserCTAButton } from '~/components/NavBar/DownloadApp/NewUserCTAButton'
// import { PageType, useIsPage } from '~/hooks/useIsPage'
import { PreferenceMenu } from '~/components/NavBar/PreferencesMenu'
import { useTabsVisible } from '~/components/NavBar/ScreenSizes'
// SPRY: search box temporarily hidden across the nav (restore these imports + the usages below to re-enable).
// import { SearchBar } from '~/components/NavBar/SearchBar'
// import { useIsSearchBarVisible } from '~/components/NavBar/SearchBar/useIsSearchBarVisible'
import { Tabs } from '~/components/NavBar/Tabs/Tabs'
import { TestnetModeTooltip } from '~/components/NavBar/TestnetMode/TestnetModeTooltip'
import { Web3Status } from '~/components/Web3Status'

const NavItemsRow = styled(Flex, {
  position: 'unset',
  row: true,
  minWidth: 0,
  alignItems: 'center',
  flexWrap: 'nowrap',
  justifyContent: 'flex-start',
  gap: '$spacing12',
  $md: {
    gap: '$spacing4',
  },
})

export function Navbar() {
  // SPRY: only used by the hidden "Get the app" CTA below.
  // const isLandingPage = useIsPage(PageType.LANDING)
  // const media = useMedia()
  // const isSmallScreen = media.md
  // const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)
  const areTabsVisible = useTabsVisible()
  // const isSearchBarVisible = useIsSearchBarVisible() // SPRY: search box temporarily hidden
  const { isConnected } = useConnectionStatus()

  const { isTestnetModeEnabled } = useEnabledChains()

  return (
    <Nav
      position="unset"
      px="$padding12"
      width="100%"
      height={INTERFACE_NAV_HEIGHT}
      zIndex={zIndexes.sticky}
      justifyContent="center"
    >
      <Flex
        position="unset"
        width="100%"
        alignItems="center"
        $platform-web={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        }}
      >
        <NavItemsRow>
          <CompanyMenu />
          {areTabsVisible && <Tabs />}
        </NavItemsRow>

        <Flex position="unset" centered>
          {/* SPRY: search box temporarily hidden. Restore: {isSearchBarVisible ? <SearchBar /> : null} */}
        </Flex>

        <NavItemsRow justifyContent="flex-end">
          {/* SPRY: search box temporarily hidden. Restore: {!isSearchBarVisible && <SearchBar />} */}
          {/* SPRY: the Uniswap "Get the app" wallet-download CTA is hidden ('/' serves Swap during testnet, so
              PageType.LANDING matched the live root route). Restore with the Landing page at mainnet:
              {!isEmbeddedWalletEnabled && isLandingPage && !isSmallScreen && <NewUserCTAButton />} (+ the imports above). */}
          {!isConnected && <PreferenceMenu />}
          {isTestnetModeEnabled && <TestnetModeTooltip />}
          <Web3Status />
        </NavItemsRow>
      </Flex>
    </Nav>
  )
}
