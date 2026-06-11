import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, Flex, LabeledCheckbox, Text, useMedia } from 'ui/src'
import { Plus } from 'ui/src/components/icons/Plus'
import { StatusIndicatorCircle } from 'ui/src/components/icons/StatusIndicatorCircle'
import { NetworkFilter } from 'uniswap/src/components/network/NetworkFilter'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { lpStatusConfig } from 'uniswap/src/features/positions/lpStatusConfig'
import { Dropdown } from '~/components/Dropdowns/Dropdown'
import { LP_POSITION_STATUS_FILTER_OPTIONS } from '~/features/Liquidity/constants'
import { getProtocolStatusLabel } from '~/features/Liquidity/utils/protocolVersion'
import { buildCreatePositionHref, type CreatePositionProtocolVersion } from '~/utils/createPositionRoute'

const StyledDropdownButton = {
  borderRadius: '$rounded12',
  py: '$padding8',
  px: '$padding12',
  borderWidth: '$spacing1',
  borderColor: '$surface3',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: '$surface2',
  },
}

type PositionsHeaderProps = {
  showFilters?: boolean
  showTitle?: boolean
  showNetworkFilter?: boolean
  showCreateButton?: boolean
  stackControlsAt?: 'sm' | 'md'
  selectedChain: UniverseChainId | null
  selectedVersions?: ProtocolVersion[]
  selectedStatus?: PositionStatus[]
  onChainChange: (selectedChain: UniverseChainId | null) => void
  onVersionChange: (toggledVersion: ProtocolVersion) => void
  onStatusChange: (toggledStatus: PositionStatus) => void
  createPositionEntryPoint?: string
}

export function PositionsHeader({
  showFilters = true,
  showTitle = true,
  showNetworkFilter = true,
  showCreateButton = true,
  stackControlsAt = 'sm',
  selectedChain,
  selectedStatus,
  onChainChange,
  onStatusChange,
  createPositionEntryPoint,
}: PositionsHeaderProps) {
  const { t } = useTranslation()
  const { chains } = useEnabledChains({ platform: Platform.EVM })
  const navigate = useNavigate()
  const media = useMedia()
  const isAddLiquidityRevamp = useFeatureFlag(FeatureFlags.AddLiquidityRevamp)
  const shouldStackControlsAtMd = stackControlsAt === 'md'
  const shouldStackControls = shouldStackControlsAtMd ? media.md : media.sm
  const shouldLeftAlignCreateButton = shouldStackControls

  const getCreatePositionHref = useCallback(
    (protocolVersion: CreatePositionProtocolVersion = 'v4') =>
      buildCreatePositionHref({
        entryPoint: createPositionEntryPoint,
        isAddLiquidityRevampEnabled: isAddLiquidityRevamp,
        protocolVersion,
      }),
    [createPositionEntryPoint, isAddLiquidityRevamp],
  )

  const navigateToCreatePosition = useCallback(
    (protocolVersion?: CreatePositionProtocolVersion) => {
      const result = navigate(getCreatePositionHref(protocolVersion))
      if (result) {
        result.catch(() => undefined)
      }
    },
    [getCreatePositionHref, navigate],
  )

  const statusFilterOptions = useMemo(() => {
    return LP_POSITION_STATUS_FILTER_OPTIONS.map((status) => {
      const config = lpStatusConfig[status]

      if (!config) {
        return <></>
      }

      return (
        <Flex
          key={`PositionsHeader-status-${status}`}
          row
          gap="$spacing8"
          width="100%"
          justifyContent="space-between"
          alignItems="center"
        >
          <StatusIndicatorCircle color={config.color} />
          <LabeledCheckbox
            py="$spacing4"
            size="$icon.18"
            hoverStyle={{ opacity: 0.8, backgroundColor: 'unset' }}
            containerStyle={{ flex: 1 }}
            checkboxPosition="end"
            checked={selectedStatus?.includes(status) ?? false}
            text={getProtocolStatusLabel(status, t)}
            onCheckPressed={() => onStatusChange(status)}
          />
        </Flex>
      )
    })
  }, [selectedStatus, onStatusChange, t])

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)

  const createPositionControl = useMemo(() => {
    if (!showCreateButton) {
      return null
    }

    // SPRY: v4-only, so there is no protocol-version picker - the create control is a single button.
    return (
      <Button
        variant="default"
        size="small"
        icon={<Plus />}
        fill={false}
        width={shouldStackControls ? '100%' : undefined}
        height={shouldStackControls ? '$spacing36' : undefined}
        justifyContent={shouldLeftAlignCreateButton ? 'flex-start' : undefined}
        onPress={() => {
          navigateToCreatePosition()
        }}
      >
        {t('position.new')}
      </Button>
    )
  }, [showCreateButton, shouldStackControls, shouldLeftAlignCreateButton, navigateToCreatePosition, t])

  if (!showTitle && !showFilters) {
    return null
  }

  return (
    <Flex gap="$gap16">
      {showTitle && <Text variant="heading3">{t('pool.positions.title')}</Text>}
      <Flex
        gap="$gap8"
        row
        alignItems="center"
        justifyContent={showTitle ? 'space-between' : 'flex-start'}
        $sm={{ flexDirection: 'column', alignItems: 'stretch' }}
        $md={
          shouldStackControlsAtMd ? { flexDirection: 'column', alignItems: 'stretch', gap: '$spacing16' } : undefined
        }
      >
        {showFilters && (
          <>
            {createPositionControl}
            <Flex
              row
              alignItems="center"
              shrink
              height="100%"
              gap="$gap8"
              width={shouldStackControls ? '100%' : undefined}
            >
              <Dropdown
                isOpen={statusDropdownOpen}
                toggleOpen={() => {
                  setStatusDropdownOpen((prev) => !prev)
                }}
                menuLabel={<Text variant="buttonLabel3">{t('common.status')}</Text>}
                dropdownStyle={{ width: 240 }}
                containerStyle={shouldStackControls ? { flex: 1 } : undefined}
                buttonStyle={{ ...StyledDropdownButton, width: shouldStackControls ? '100%' : undefined }}
                alignRight={false}
              >
                {statusFilterOptions}
              </Dropdown>
              {showNetworkFilter && (
                <Flex
                  centered
                  px="$padding12"
                  borderWidth="$spacing1"
                  borderColor="$surface3"
                  borderRadius="$rounded12"
                  hoverStyle={{ backgroundColor: '$surface2' }}
                >
                  <NetworkFilter
                    includeAllNetworks
                    selectedChain={selectedChain}
                    onPressChain={onChainChange}
                    chainIds={chains}
                    styles={{
                      buttonPaddingY: '$spacing8',
                    }}
                  />
                </Flex>
              )}
            </Flex>
          </>
        )}
      </Flex>
    </Flex>
  )
}
