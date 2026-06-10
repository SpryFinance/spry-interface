import { uniswapUrls } from 'uniswap/src/constants/urls'
import { TestID } from 'uniswap/src/test/fixtures/testIDs'
import { expect, getTest } from '~/playwright/fixtures'

const test = getTest()

const tabs = [
  {
    label: 'Trade',
    path: '/swap',
    dropdown: [{ label: 'Swap', path: '/swap' }],
  },
  {
    label: 'Explore',
    path: '/explore',
    dropdown: [
      { label: 'Tokens', path: '/explore/tokens' },
      { label: 'Pools', path: '/explore/pools' },
      { label: 'Transactions', path: '/explore/transactions' },
    ],
  },
  {
    label: 'Pool',
    path: '/positions',
    dropdown: [
      { label: 'View position', path: '/positions' },
      { label: 'Create position', path: '/positions/create' },
    ],
  },
]
// Discord is a '#' placeholder until Spry's invite link exists, so it is not asserted here.
const socialMediaLinks = ['https://github.com/spryfinance', 'https://x.com/spry_fi']

test.describe(
  'NavBar',
  {
    tag: '@team:apps-infra',
    annotation: [
      { type: 'DD_TAGS[team]', description: 'apps-infra' },
      { type: 'DD_TAGS[test.type]', description: 'web-e2e' },
    ],
  },
  () => {
    test.describe('Desktop navigation', () => {
      test('clicking nav icon redirects to home page', async ({ page }) => {
        await page.goto('/swap')
        await page.getByTestId(TestID.NavUniswapLogo).click()
        await expect(page).toHaveURL(/\/\?intro=true/)
      })

      // SPRY: the Uniswap company mega-menu is removed on desktop; the brand mark is just a home link.
      test('does not render the company mega-menu', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByTestId(TestID.NavCompanyMenu)).toHaveCount(0)
      })

      for (const tab of tabs) {
        test(`displays "${tab.label}" tab and navigates`, async ({ page }) => {
          await page.goto('/')
          await page.getByTestId(`${tab.label}-tab`).locator('a').click()
          await expect(page).toHaveURL(tab.path)
        })
      }
    })

    test.describe('Mobile navigation', () => {
      test.beforeEach(async ({ page }) => {
        // Set a mobile viewport
        await page.setViewportSize({ width: 449, height: 900 })
        await page.goto('/')
        await page.waitForTimeout(500)
        await page.getByTestId(TestID.NavCompanyMenu).click()
      })

      for (const tab of tabs) {
        test(`displays "${tab.label}" tab and navigates`, async ({ page }) => {
          const drawer = page.getByTestId(TestID.CompanyMenuMobileDrawer)
          await drawer.getByRole('link', { name: tab.label }).click()
          await expect(page).toHaveURL(tab.path)
        })
      }

      test('displays mobile drawer with social media and legal content', async ({ page }) => {
        const drawer = page.getByTestId(TestID.CompanyMenuMobileDrawer)
        await expect(drawer).toBeVisible()

        // Verify social media links
        for (const link of socialMediaLinks) {
          await expect(page.getByTestId(TestID.CompanyMenuMobileDrawer).locator(`a[href='${link}']`)).toBeVisible()
        }

        // Verify Legal & Privacy section
        await expect(drawer.getByText('Legal & Privacy')).toBeVisible()
        await drawer.getByText('Legal & Privacy').click()

        await expect(drawer.getByText('Your Privacy Choices')).toBeVisible()
        await expect(drawer.getByText('Privacy Policy')).toBeVisible()
        await expect(drawer.getByText('Terms of Service')).toBeVisible()

        await expect(drawer.locator(`a[href="${uniswapUrls.termsOfServiceUrl}"]`)).toBeVisible()
      })

      test('displays mobile-specific UI elements', async ({ page }) => {
        // Verify help modal from mobile drawer
        await page.getByTestId(TestID.CompanyMenuMobileDrawer).getByTestId(TestID.HelpIcon).click()
        await expect(page.getByTestId(TestID.HelpModal)).toBeVisible()

        await expect(page.getByTestId(TestID.HelpModal).getByText('Get help')).toBeVisible()
        await expect(page.getByTestId(TestID.HelpModal).getByText('Docs')).toBeVisible()
        await expect(page.getByTestId(TestID.HelpModal).getByText('Contact us')).toBeVisible()

        await expect(
          page.getByTestId(TestID.HelpModal).locator('a[href="https://support.uniswap.org/hc/en-us"]'),
        ).toBeVisible()
        await expect(page.getByTestId(TestID.HelpModal).locator('a[href="https://docs.uniswap.org/"]')).toBeVisible()
        await expect(
          page.getByTestId(TestID.HelpModal).locator('a[href="https://support.uniswap.org/hc/en-us/requests/new"]'),
        ).toBeVisible()
      })

      test('displays bottom bar on token details page', async ({ page }) => {
        await page.goto('/explore/tokens/ethereum/NATIVE')
        const bottomBar = page.getByTestId(TestID.TokenDetailsMobileBottomBar)
        await expect(bottomBar).toBeVisible()
        await expect(bottomBar.getByText('Buy')).toBeVisible()
        // "Sell" only appears when the connected wallet has a token balance
      })
    })
  },
)
