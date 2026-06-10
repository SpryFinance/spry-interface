import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { CoinConvert } from 'ui/src/components/icons/CoinConvert'
import { Compass } from 'ui/src/components/icons/Compass'
import { Pools } from 'ui/src/components/icons/Pools'
import { Wallet } from 'ui/src/components/icons/Wallet'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import { MenuItem } from '~/components/NavBar/CompanyMenu/Content'
import { PageType } from '~/hooks/useIsPage'
import { usePortfolioRoutes } from '~/pages/Portfolio/Header/hooks/usePortfolioRoutes'
import { PortfolioTab } from '~/pages/Portfolio/types'
import { buildPortfolioUrl } from '~/pages/Portfolio/utils/portfolioUrls'
import { EntryPointKind, resolveEntryPoint } from '~/utils/createPositionEntryPoint'

export type TabsSection = {
  title: string
  href: string
  isActive?: boolean
  items?: TabsItem[]
  closeMenu?: () => void
  icon?: JSX.Element
  elementName: ElementName
  // SPRY: temporarily renders the tab grayed out, unreachable, with a "Soon" badge (see Tabs.tsx).
  // Remove this field and the `comingSoon: true` usages below to fully re-enable a tab.
  comingSoon?: boolean
}

export type TabsItem = MenuItem & {
  icon?: JSX.Element
}

export const useTabsContent = (): TabsSection[] => {
  const { t } = useTranslation()
  const { pathname, search, state } = useLocation()
  const { chainId: portfolioChainId, isExternalWallet } = usePortfolioRoutes()
  const isPortfolioDefiTabEnabled = useFeatureFlag(FeatureFlags.PortfolioDefiTab)
  const portfolioPoolsBalancesEnabled = useFeatureFlag(FeatureFlags.PortfolioPoolsBalances)
  const isToucanLaunchAuctionEnabled = useFeatureFlag(FeatureFlags.ToucanLaunchAuction)
  const isAddLiquidityRevamp = useFeatureFlag(FeatureFlags.AddLiquidityRevamp)
  const entryPoint = resolveEntryPoint({ search, state })
  const isPortfolioPoolsEntryPointActive = entryPoint.kind === EntryPointKind.PortfolioPools

  return [
    {
      title: t('common.swap'),
      href: '/swap',
      isActive: pathname.startsWith('/swap') || pathname.startsWith('/send'),
      icon: <CoinConvert color="$accent1" size="$icon.20" />,
      elementName: ElementName.NavbarTradeTab,
    },
    // SPRY: Pool sits right next to Swap (the two live Spry surfaces). Explore and Portfolio follow,
    // both temporarily marked comingSoon below.
    {
      title: t('common.pool'),
      href: '/positions',
      isActive:
        !isPortfolioPoolsEntryPointActive && (pathname.startsWith('/positions') || pathname.startsWith('/liquidity')),
      icon: <Pools color="$accent1" size="$icon.20" />,
      elementName: ElementName.NavbarPoolTab,
      items: [
        {
          label: t('nav.tabs.viewPositions'),
          href: '/positions',
          internal: true,
          elementName: ElementName.NavbarPoolDropdownViewPositions,
        },
        {
          label: t('nav.tabs.createPosition'),
          href: isAddLiquidityRevamp ? '/positions/add' : '/positions/create',
          internal: true,
          elementName: ElementName.NavbarPoolDropdownCreatePosition,
        },
        ...(isToucanLaunchAuctionEnabled
          ? [
              {
                label: t('toucan.createAuction.launchAuction'),
                href: '/liquidity/launch-auction',
                internal: true,
                elementName: ElementName.NavbarPoolDropdownLaunchAuction,
              },
            ]
          : []),
      ],
    },
    {
      title: t('common.explore'),
      href: '/explore',
      isActive: pathname.startsWith('/explore') || pathname.startsWith('/nfts'),
      icon: <Compass color="$accent1" size="$icon.20" />,
      elementName: ElementName.NavbarExploreTab,
      // SPRY: temporarily disabled - grayed/unreachable with a "Soon" badge. Remove to re-enable.
      comingSoon: true,
      items: [
        {
          label: t('common.tokens'),
          href: '/explore/tokens',
          internal: true,
          elementName: ElementName.NavbarExploreDropdownTokens,
        },
        {
          label: t('toucan.auctions'),
          href: '/explore/auctions',
          internal: true,
          elementName: ElementName.NavbarExploreDropdownToucan,
        },
        {
          label: t('common.pools'),
          href: '/explore/pools',
          internal: true,
          elementName: ElementName.NavbarExploreDropdownPools,
        },
        {
          label: t('common.transactions'),
          href: '/explore/transactions',
          internal: true,
          elementName: ElementName.NavbarExploreDropdownTransactions,
        },
      ],
    },
    {
      title: t('common.portfolio'),
      href: buildPortfolioUrl({
        tab: PortfolioTab.Overview,
        chainId: portfolioChainId,
      }),
      isActive: (pathname.startsWith(PageType.PORTFOLIO) && !isExternalWallet) || isPortfolioPoolsEntryPointActive,
      icon: <Wallet color="$accent1" size="$icon.20" />,
      elementName: ElementName.NavbarPortfolioTab,
      // SPRY: temporarily disabled - grayed/unreachable with a "Soon" badge. Remove to re-enable.
      comingSoon: true,
      items: [
        {
          label: t('portfolio.overview.title'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Overview,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownOverview,
        },
        {
          label: t('common.tokens'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Tokens,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownTokens,
        },
        ...(portfolioPoolsBalancesEnabled
          ? [
              {
                label: t('common.pools'),
                href: buildPortfolioUrl({
                  tab: PortfolioTab.Pools,
                  chainId: portfolioChainId,
                }),
                internal: true,
                elementName: ElementName.NavbarPortfolioDropdownPools,
              },
            ]
          : []),
        ...(isPortfolioDefiTabEnabled
          ? [
              {
                label: t('portfolio.defi.title'),
                href: buildPortfolioUrl({
                  tab: PortfolioTab.Defi,
                  chainId: portfolioChainId,
                }),
                internal: true,
                elementName: ElementName.NavbarPortfolioDropdownDefi,
              },
            ]
          : []),
        {
          label: t('portfolio.nfts.title'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Nfts,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownNfts,
        },
        {
          label: t('common.activity'),
          href: buildPortfolioUrl({
            tab: PortfolioTab.Activity,
            chainId: portfolioChainId,
          }),
          internal: true,
          elementName: ElementName.NavbarPortfolioDropdownActivity,
        },
      ],
    },
  ]
}
