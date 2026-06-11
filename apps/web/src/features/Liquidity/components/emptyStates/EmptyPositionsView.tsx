import { useTranslation } from 'react-i18next'
import { Button, Flex, Text } from 'ui/src'
import { ElementName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import {
  BUTTON_AREA_WIDTH,
  PositionsEmptyStateLayout,
} from '~/features/Liquidity/components/emptyStates/PositionsEmptyStateLayout'

export function EmptyPositionsView({
  newPositionHref,
  withBorder,
  showNewPositionAction = true,
}: {
  newPositionHref: string
  withBorder?: boolean
  showNewPositionAction?: boolean
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <PositionsEmptyStateLayout
      title={t('positions.noPositions.title')}
      description={t('positions.noPositions.description')}
      withBorder={withBorder}
      action={
        <Flex
          row
          gap="$gap8"
          justifyContent="center"
          $md={{ flexDirection: 'column', width: '100%' }}
          width={BUTTON_AREA_WIDTH}
        >
          {/* SPRY: "Explore pools" is a coming-soon button for the testnet phase (grayed + unreachable, no link),
              matching the disabled Explore/Portfolio navs. Restore the Trace + tag="a"/href and drop the badge to re-enable.
              Both buttons size to their label (fill={false}) and the row centers them, so New Position is a touch more
              compact than a stretched half-width button (full width still on mobile via the $md width). */}
          <Flex position="relative" $md={{ width: '100%' }}>
            <Button
              fill={false}
              $md={{
                py: '$spacing16',
                width: '100%',
              }}
              variant="default"
              size="small"
              emphasis="secondary"
              isDisabled
              cursor="default"
            >
              {t('pools.explore')}
            </Button>
            <Flex
              position="absolute"
              top={-6}
              right={-6}
              backgroundColor="$statusWarning"
              borderRadius="$rounded4"
              px="$spacing4"
              py="$spacing1"
            >
              <Text variant="body4" fontSize={8} lineHeight={10} fontWeight="600" color="$surface1">
                Soon
              </Text>
            </Flex>
          </Flex>
          {showNewPositionAction && (
            <Trace logPress element={ElementName.PositionsEmptyStateNewPosition}>
              <Button
                fill={false}
                $md={{
                  py: '$spacing16',
                  width: '100%',
                }}
                variant="default"
                size="small"
                tag="a"
                href={newPositionHref}
                $platform-web={{
                  textDecoration: 'none',
                }}
              >
                {t('position.new')}
              </Button>
            </Trace>
          )}
        </Flex>
      }
    />
  )
}
