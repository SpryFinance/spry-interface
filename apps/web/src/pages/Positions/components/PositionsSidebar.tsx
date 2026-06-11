import { useTranslation } from 'react-i18next'
import { Flex, Text } from 'ui/src'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import type { UniverseChainId } from 'uniswap/src/features/chains/types'
import PROVIDE_LIQUIDITY from '~/assets/images/provideLiquidity.png'
import V4_HOOK from '~/assets/images/v4Hooks.png'
import { LearnMoreTile } from '~/features/Liquidity/components/LearnMoreTiles'
import { ExternalArrowLink } from '~/features/Liquidity/ExternalArrowLink'
// SPRY: "Top pools by TVL" hidden for the testnet phase. Restore this import + the render below to bring it back.
// import { TopPools } from '~/pages/Positions/TopPools'

interface PositionsSidebarProps {
  chainFilter: UniverseChainId | null
  isConnected: boolean
}

export function PositionsSidebar({ isConnected }: PositionsSidebarProps) {
  const { t } = useTranslation()
  return (
    <Flex gap="$gap32">
      {/* SPRY: "Top pools by TVL" hidden for the testnet phase. Restore: <TopPools chainId={chainFilter} /> (+ the import + the chainFilter prop). */}
      {isConnected && (
        <Flex gap="$gap20" mb="$spacing24">
          <Text variant="subheading1">{t('liquidity.learnMoreLabel')}</Text>
          <Flex gap="$gap12">
            <LearnMoreTile
              img={PROVIDE_LIQUIDITY}
              text={t('liquidity.provideOnProtocols')}
              link={uniswapUrls.helpArticleUrls.providingLiquidityInfo}
            />
            <LearnMoreTile img={V4_HOOK} text={t('liquidity.hooks')} link={uniswapUrls.helpArticleUrls.v4HooksInfo} />
          </Flex>
          <ExternalArrowLink href={uniswapUrls.helpArticleUrls.positionsLearnMore}>
            {t('common.button.learn')}
          </ExternalArrowLink>
        </Flex>
      )}
    </Flex>
  )
}
