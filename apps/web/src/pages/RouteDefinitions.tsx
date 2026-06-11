import { isDevEnv } from '@universe/environment'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { lazy, ReactNode, Suspense, useMemo } from 'react'
import { matchPath, Navigate, Route, Routes, useLocation } from 'react-router'
import { WRAPPED_PATH } from 'uniswap/src/components/banners/shared/utils'
import { CHROME_EXTENSION_UNINSTALL_URL_PATH } from 'uniswap/src/constants/urls'
import { EXTENSION_PASSKEY_AUTH_PATH } from 'uniswap/src/features/passkey/constants'
import i18n from 'uniswap/src/i18n'
import { getExploreDescription, getExploreTitle } from '~/pages/getExploreTitle'
import { getPortfolioDescription, getPortfolioTitle } from '~/pages/getPortfolioTitle'
import { getPositionPageDescription, getPositionPageTitle } from '~/pages/getPositionPageTitle'
// High-traffic pages (index and /swap) should not be lazy-loaded.
// SPRY: index serves the swap page while testnet-only, so the Landing import is parked
// (restore it with the `/` getElement below for mainnets). Landing still renders /preview.
// import { Landing } from '~/pages/Landing'
import { SwapPage } from '~/pages/Swap'
import { isBrowserRouterEnabled } from '~/utils/env'

const AddLiquidity = lazy(() => import('~/pages/AddLiquidity/AddLiquidity'))
const AddLiquidityPool = lazy(() => import('~/pages/AddLiquidity/AddLiquidityPool'))
const CreatePosition = lazy(() => import('~/pages/CreatePosition/CreatePosition'))
const RedirectExplore = lazy(() => import('~/pages/Explore/redirects'))
const NotFound = lazy(() => import('~/pages/NotFound'))
const Pool = lazy(() => import('~/pages/Positions'))
const PositionPage = lazy(() => import('~/pages/Positions/PositionPage'))
const PoolDetails = lazy(() => import('~/pages/PoolDetails'))
const TokenDetails = lazy(() => import('~/pages/TokenDetails/TokenDetailsPage'))
const ExtensionPasskeyAuthPopUp = lazy(() => import('~/pages/ExtensionPasskeyAuthPopUp'))
const PasskeyManagement = lazy(() => import('~/pages/PasskeyManagement'))
const ExtensionUninstall = lazy(() => import('~/pages/ExtensionUninstall/ExtensionUninstall'))
const Portfolio = lazy(() => import('~/pages/Portfolio/Portfolio'))
const BetaPage = lazy(() => import('~/pages/Beta'))
const Wrapped = lazy(() => import('~/pages/Wrapped'))
const SpryProbe = lazy(() => import('~/pages/SpryProbe'))

interface RouterConfig {
  browserRouterEnabled?: boolean
  hash?: string
  isAddLiquidityRevampEnabled?: boolean
  isEmbeddedWalletEnabled?: boolean
  isWrappedEnabled?: boolean
}

/**
 * Convenience hook which organizes the router configuration into a single object.
 */
export function useRouterConfig(): RouterConfig {
  const browserRouterEnabled = isBrowserRouterEnabled()
  const { hash } = useLocation()
  const isAddLiquidityRevampEnabled = useFeatureFlag(FeatureFlags.AddLiquidityRevamp)
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)
  const isWrappedEnabled = useFeatureFlag(FeatureFlags.UniswapWrapped2025)

  return useMemo(
    () => ({
      browserRouterEnabled,
      hash,
      isAddLiquidityRevampEnabled,
      isEmbeddedWalletEnabled,
      isWrappedEnabled,
    }),
    [browserRouterEnabled, hash, isAddLiquidityRevampEnabled, isEmbeddedWalletEnabled, isWrappedEnabled],
  )
}

// SEO titles and descriptions sourced from https://docs.google.com/spreadsheets/d/1_6vSxGgmsx6QGEZ4mdHppv1VkuiJEro3Y_IopxUHGB4/edit#gid=0
// getTitle and getDescription are used as static metatags for SEO. Dynamic metatags should be set in the page component itself
const StaticTitlesAndDescriptions = {
  UniswapTitle: i18n.t('title.uniswapTradeCrypto'),
  SwapTitle: i18n.t('title.buySellTradeEthereum'),
  SwapDescription: i18n.t('title.swappingMadeSimple'),
  DetailsPageBaseTitle: i18n.t('common.buyAndSell'),
  TDPDescription: i18n.t('title.realTime'),
  PDPDescription: i18n.t('title.tradeTokens'),
  MigrateTitle: i18n.t('title.migratev2'),
  MigrateTitleV3: i18n.t('title.migratev3'),
  MigrateDescription: i18n.t('title.easilyRemove'),
  MigrateDescriptionV4: i18n.t('title.easilyRemoveV4'),
  AddLiquidityDescription: i18n.t('title.earnFees'),
  PasskeyManagementTitle: i18n.t('title.managePasskeys'),
}

export interface RouteDefinition {
  path: string
  nestedPaths: string[]
  getTitle: (path?: string) => string
  getDescription: (path?: string) => string
  enabled: (args: RouterConfig) => boolean
  getElement: (args: RouterConfig) => ReactNode
}

// Assigns the defaults to the route definition.
function createRouteDefinition(route: Partial<RouteDefinition>): RouteDefinition {
  return {
    getElement: () => null,
    getTitle: () => StaticTitlesAndDescriptions.UniswapTitle,
    getDescription: () => StaticTitlesAndDescriptions.SwapDescription,
    enabled: () => true,
    path: '/',
    nestedPaths: [],
    // overwrite the defaults
    ...route,
  }
}

export const routes: RouteDefinition[] = [
  createRouteDefinition({
    path: '/',
    getTitle: () => StaticTitlesAndDescriptions.UniswapTitle,
    getDescription: () => StaticTitlesAndDescriptions.SwapDescription,
    // SPRY: index serves the swap page (same as /swap) while testnet-only. Original Landing
    // index, restore for mainnets: `... && args.hash ? <Navigate .../> : <Landing />`
    getElement: (args) => {
      return args.browserRouterEnabled && args.hash ? (
        <Navigate to={args.hash.replace('#', '')} replace />
      ) : (
        <SwapPage />
      )
    },
  }),
  createRouteDefinition({
    path: '/explore',
    getTitle: getExploreTitle,
    getDescription: getExploreDescription,
    nestedPaths: [':tab', ':chainName', ':tab/:chainName'],
    getElement: () => <RedirectExplore />,
  }),
  createRouteDefinition({
    path: '/explore/tokens/:chainName/:tokenAddress',
    getTitle: () => i18n.t('common.buyAndSell'),
    getDescription: () => StaticTitlesAndDescriptions.TDPDescription,
    getElement: () => (
      <Suspense fallback={null}>
        <TokenDetails />
      </Suspense>
    ),
  }),
  createRouteDefinition({
    path: '/tokens',
    getTitle: getExploreTitle,
    getDescription: getExploreDescription,
    getElement: () => <Navigate to="/explore/tokens" replace />,
  }),
  createRouteDefinition({
    path: '/tokens/:chainName',
    getTitle: getExploreTitle,
    getDescription: getExploreDescription,
    getElement: () => <RedirectExplore />,
  }),
  createRouteDefinition({
    path: '/tokens/:chainName/:tokenAddress',
    getTitle: () => StaticTitlesAndDescriptions.DetailsPageBaseTitle,
    getDescription: () => StaticTitlesAndDescriptions.TDPDescription,
    getElement: () => <RedirectExplore />,
  }),
  createRouteDefinition({
    path: '/explore/pools/:chainName/:poolAddress',
    getTitle: () => StaticTitlesAndDescriptions.DetailsPageBaseTitle,
    getDescription: () => StaticTitlesAndDescriptions.PDPDescription,
    getElement: () => (
      <Suspense fallback={null}>
        <PoolDetails />
      </Suspense>
    ),
  }),
  createRouteDefinition({
    path: '/vote/*',
    getTitle: () => i18n.t('title.voteOnGov'),
    getDescription: () => i18n.t('title.uniToken'),
    getElement: () => {
      return (
        <Routes>
          <Route
            path="*"
            Component={() => {
              window.location.href = 'https://vote.uniswapfoundation.org'
              return null
            }}
            // oxlint-disable-next-line react/self-closing-comp -- biome-parity: oxlint is stricter here
          ></Route>
        </Routes>
      )
    },
  }),
  createRouteDefinition({
    path: '/create-proposal',
    getTitle: () => i18n.t('title.createGovernanceOn'),
    getDescription: () => i18n.t('title.createGovernanceTo'),
    getElement: () => <Navigate to="/vote/create-proposal" replace />,
  }),
  createRouteDefinition({
    path: '/send',
    getElement: () => <SwapPage />,
    getTitle: () => i18n.t('title.sendTokens'),
  }),
  createRouteDefinition({
    path: '/swap',
    getElement: () => <SwapPage />,
    getTitle: () => StaticTitlesAndDescriptions.SwapTitle,
  }),
  // Refreshed pool routes
  createRouteDefinition({
    path: '/positions/add/new',
    getElement: () => <CreatePosition />,
    getTitle: getPositionPageTitle,
    getDescription: () => StaticTitlesAndDescriptions.AddLiquidityDescription,
    enabled: (args) => Boolean(args.isAddLiquidityRevampEnabled),
  }),
  createRouteDefinition({
    path: '/positions/add/:chainName/:poolAddress',
    getElement: () => <AddLiquidityPool />,
    getTitle: getPositionPageTitle,
    getDescription: () => StaticTitlesAndDescriptions.AddLiquidityDescription,
    enabled: (args) => Boolean(args.isAddLiquidityRevampEnabled),
  }),
  createRouteDefinition({
    path: '/positions/add',
    getElement: () => <AddLiquidity />,
    getTitle: getPositionPageTitle,
    getDescription: () => StaticTitlesAndDescriptions.AddLiquidityDescription,
    enabled: (args) => Boolean(args.isAddLiquidityRevampEnabled),
  }),
  createRouteDefinition({
    path: '/positions/create',
    getElement: () => <CreatePosition />,
    getTitle: getPositionPageTitle,
    getDescription: getPositionPageDescription,
    nestedPaths: [':protocolVersion'],
  }),
  createRouteDefinition({
    path: '/positions',
    getElement: () => <Pool />,
    getTitle: getPositionPageTitle,
    getDescription: getPositionPageDescription,
  }),
  createRouteDefinition({
    path: '/positions/v4/:chainName/:tokenId',
    getElement: () => <PositionPage />,
    getTitle: getPositionPageTitle,
    getDescription: getPositionPageDescription,
  }),
  createRouteDefinition({
    path: EXTENSION_PASSKEY_AUTH_PATH,
    getElement: () => <ExtensionPasskeyAuthPopUp />,
    getTitle: () => i18n.t('title.extensionPasskeyLogIn'),
  }),
  createRouteDefinition({
    path: '/manage/passkey/:walletAddress',
    getElement: () => <PasskeyManagement />,
    getTitle: () => StaticTitlesAndDescriptions.PasskeyManagementTitle,
    enabled: (args) => args.isEmbeddedWalletEnabled ?? false,
  }),
  // Portfolio Pages
  createRouteDefinition({
    path: '/portfolio',
    getElement: () => <Portfolio />,
    getTitle: getPortfolioTitle,
    getDescription: getPortfolioDescription,
    nestedPaths: [
      'tokens',
      'pools',
      'defi',
      'nfts',
      'activity',
      ':walletAddress',
      ':walletAddress/tokens',
      ':walletAddress/pools',
      ':walletAddress/defi',
      ':walletAddress/nfts',
      ':walletAddress/activity',
    ],
  }),
  // Uniswap Extension Uninstall Page
  createRouteDefinition({
    path: CHROME_EXTENSION_UNINSTALL_URL_PATH,
    getElement: () => <ExtensionUninstall />,
    getTitle: () => i18n.t('title.extension.uninstall'),
  }),
  // Uniswap Wrapped
  createRouteDefinition({
    path: WRAPPED_PATH,
    getElement: () => <Wrapped />,
    getTitle: () => 'Uniswap Wrapped',
    enabled: (args) => args.isWrappedEnabled ?? false,
  }),
  createRouteDefinition({
    path: '/preview',
    getTitle: () => 'Uniswap Preview',
    getElement: () => (
      <Suspense fallback={null}>
        <BetaPage />
      </Suspense>
    ),
  }),
  // Temporary Spry integration probe: first live read from the @spry/* packages.
  // Dev-only - excluded from production builds.
  createRouteDefinition({
    path: '/spry',
    enabled: () => isDevEnv(),
    getTitle: () => 'Spry',
    getElement: () => (
      <Suspense fallback={null}>
        <SpryProbe />
      </Suspense>
    ),
  }),
  createRouteDefinition({ path: '*', getElement: () => <Navigate to="/not-found" replace /> }),
  createRouteDefinition({ path: '/not-found', getElement: () => <NotFound /> }),
]

export const findRouteByPath = (pathname: string) => {
  for (const route of routes) {
    const match = matchPath(route.path, pathname)
    if (match) {
      return route
    }
    const subPaths = route.nestedPaths.map((nestedPath) => `${route.path}/${nestedPath}`)
    for (const subPath of subPaths) {
      // oxlint-disable-next-line no-shadow
      const match = matchPath(subPath, pathname)
      if (match) {
        return route
      }
    }
  }
  return undefined
}
