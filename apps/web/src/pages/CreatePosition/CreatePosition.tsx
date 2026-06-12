import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { Currency } from '@uniswap/sdk-core'
import { parseRestProtocolVersion } from '@universe/api'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Button, Flex, styled } from 'ui/src'
import { RotateLeft } from 'ui/src/components/icons/RotateLeft'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { Deadline } from 'uniswap/src/features/transactions/components/settings/settingsConfigurations/deadline/Deadline/Deadline'
import { Slippage } from 'uniswap/src/features/transactions/components/settings/settingsConfigurations/slippage/Slippage/Slippage'
import { LPTransactionSettingsStoreContextProvider } from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/LPTransactionSettingsStoreContextProvider'
import { useTransactionSettingsStore } from 'uniswap/src/features/transactions/components/settings/stores/transactionSettingsStore/useTransactionSettingsStore'
import { usePrevious } from 'utilities/src/react/hooks'
import { FormStepsWrapper, FormWrapper } from '~/features/Liquidity/Create/FormWrapper'
import { useLiquidityUrlState } from '~/features/Liquidity/Create/hooks/useLiquidityUrlState'
import { useLPSlippageValue } from '~/features/Liquidity/Create/hooks/useLPSlippageValues'
import { ResetCreatePositionFormModal } from '~/features/Liquidity/Create/ResetCreatePositionsFormModal'
import { PositionFlowStep } from '~/features/Liquidity/Create/types'
import { LPSettings } from '~/features/Liquidity/LPSettings'
import {
  CreateLiquidityContextProvider,
  useCreateLiquidityContext,
} from '~/pages/CreatePosition/CreateLiquidityContextProvider'
import { CreatePositionTxContextProvider } from '~/pages/CreatePosition/CreatePositionTxContext'
import { MultichainContextProvider } from '~/state/multichain/MultichainContext'
import { useMultichainContext } from '~/state/multichain/useMultichainContext'

function CreatePositionInner({
  currencyInputs,
  setCurrencyInputs,
}: {
  currencyInputs: { tokenA: Maybe<Currency>; tokenB: Maybe<Currency> }
  setCurrencyInputs: Dispatch<SetStateAction<{ tokenA: Maybe<Currency>; tokenB: Maybe<Currency> }>>
}) {
  const {
    positionState: { protocolVersion },
    creatingPoolOrPair,
    step,
    setStep,
  } = useCreateLiquidityContext()
  const v2Selected = protocolVersion === ProtocolVersion.V2

  const handleContinue = useCallback(() => {
    if (v2Selected) {
      if (step === PositionFlowStep.SELECT_TOKENS_AND_FEE_TIER && creatingPoolOrPair) {
        setStep(PositionFlowStep.PRICE_RANGE)
      } else {
        setStep(PositionFlowStep.DEPOSIT)
      }
    } else {
      setStep(step + 1)
    }
  }, [creatingPoolOrPair, step, v2Selected, setStep])

  return (
    <FormStepsWrapper
      currencyInputs={currencyInputs}
      setCurrencyInputs={setCurrencyInputs}
      onSelectTokensContinue={handleContinue}
    />
  )
}

interface ResetProps {
  onClickReset: () => void
  isDisabled: boolean
}

const ResetButton = ({ onClickReset, isDisabled }: ResetProps) => {
  const { t } = useTranslation()
  return (
    <Button size="small" emphasis="tertiary" onPress={onClickReset} isDisabled={isDisabled} icon={<RotateLeft />}>
      {t('common.button.reset')}
    </Button>
  )
}

const ToolbarContainer = styled(Flex, {
  row: true,
  centered: true,
  gap: '$gap8',
  $md: {
    '$platform-web': {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr auto',
      gridColumnGap: '8px',
    },
  },
})

const Toolbar = () => {
  const {
    isNativeTokenAOnly,
    currencies,
    reset: resetCreatePositionState,
    resetPriceRange: resetPriceRangeState,
    resetDeposit: resetDepositState,
  } = useCreateLiquidityContext()
  const customSlippageTolerance = useTransactionSettingsStore((s) => s.customSlippageTolerance)

  const [showResetModal, setShowResetModal] = useState(false)

  const { reset: resetMultichainState } = useMultichainContext()

  const { isTestnetModeEnabled } = useEnabledChains()
  const prevIsTestnetModeEnabled = usePrevious(isTestnetModeEnabled)

  const handleReset = useCallback(() => {
    resetCreatePositionState()
    resetPriceRangeState()
    resetMultichainState()
    resetDepositState()
  }, [resetDepositState, resetCreatePositionState, resetMultichainState, resetPriceRangeState])

  useEffect(() => {
    // Only reset when testnet mode changes after initial mount
    // Don't reset on initial mount to preserve URL parameters
    if (prevIsTestnetModeEnabled !== undefined && isTestnetModeEnabled !== prevIsTestnetModeEnabled) {
      handleReset()
    }
  }, [handleReset, isTestnetModeEnabled, prevIsTestnetModeEnabled])

  // SPRY: the protocol-version dropdown ("v4 position") is pruned - Spry is v4-only, so the
  // dropdown had nothing to offer. Restore from git history if other versions ever return.
  return (
    <Flex>
      <ResetCreatePositionFormModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onHandleReset={handleReset}
      />

      <ToolbarContainer>
        <ResetButton onClickReset={() => setShowResetModal(true)} isDisabled={isNativeTokenAOnly} />
        <Flex
          borderRadius="$rounded12"
          borderWidth={!customSlippageTolerance ? '$spacing1' : '$none'}
          borderColor="$surface3"
          height="38px"
          px={!customSlippageTolerance ? '$gap8' : '$gap4'}
          alignItems="center"
          pt="$spacing2"
        >
          <LPSettings
            position="relative"
            adjustRightAlignment={false}
            adjustTopAlignment={false}
            settings={[Slippage, Deadline]}
            iconColor="$neutral1"
            iconSize="$icon.16"
            isNativePool={Boolean(currencies.sdk.TOKEN0?.isNative || currencies.sdk.TOKEN1?.isNative)}
          />
        </Flex>
      </ToolbarContainer>
    </Flex>
  )
}

// SPRY: the custom fee-tier search modal and its dynamic-fee speedbump are pruned - Spry pools
// only exist at the five fixed tiers (the SpryTierSelector), so there is nothing to search or
// create. The export stays (AddLiquidityPool renders it) but mounts nothing; restore the
// FeeTierSearchModal + DynamicFeeTierSpeedbump renders from git history if custom tiers return.
export const SharedCreateModals = (): null => {
  return null
}

function CreatePositionContent({
  initialInputs,
  paramsProtocolVersion,
  autoSlippageTolerance,
}: {
  initialInputs: ReturnType<typeof useLiquidityUrlState>
  paramsProtocolVersion: ProtocolVersion | undefined
  autoSlippageTolerance: number
}) {
  const initialProtocolVersion = paramsProtocolVersion ?? ProtocolVersion.V4

  const [currencyInputs, setCurrencyInputs] = useState<{ tokenA: Maybe<Currency>; tokenB: Maybe<Currency> }>({
    tokenA: initialInputs.tokenA,
    tokenB: initialInputs.tokenB,
  })

  return (
    <Trace logImpression page={InterfacePageName.CreatePosition}>
      <MultichainContextProvider initialChainId={initialInputs.chainId}>
        <LPTransactionSettingsStoreContextProvider autoSlippageTolerance={autoSlippageTolerance}>
          <CreateLiquidityContextProvider
            currencyInputs={currencyInputs}
            setCurrencyInputs={setCurrencyInputs}
            initialPositionState={{
              fee: initialInputs.fee ?? undefined,
              hook: initialInputs.hook ?? undefined,
              protocolVersion: initialProtocolVersion,
            }}
            defaultInitialToken={initialInputs.defaultInitialToken}
            initialPriceRangeState={initialInputs.priceRangeState}
            initialDepositState={initialInputs.depositState}
            initialFlowStep={initialInputs.flowStep}
          >
            <CreatePositionTxContextProvider>
              <FormWrapper toolbar={<Toolbar />}>
                <CreatePositionInner currencyInputs={currencyInputs} setCurrencyInputs={setCurrencyInputs} />
              </FormWrapper>
              <SharedCreateModals />
            </CreatePositionTxContextProvider>
          </CreateLiquidityContextProvider>
        </LPTransactionSettingsStoreContextProvider>
      </MultichainContextProvider>
    </Trace>
  )
}

export function CreatePosition() {
  // URL format is `/positions/create/:protocolVersion`, with possible searchParams `?currencyA=...&currencyB=...&chain=...&feeTier=...&hook=...`
  const { protocolVersion } = useParams<{
    protocolVersion: string
  }>()
  const paramsProtocolVersion = parseRestProtocolVersion(protocolVersion)

  const autoSlippageTolerance = useLPSlippageValue({
    version: paramsProtocolVersion,
  })

  const initialInputs = useLiquidityUrlState()

  if (initialInputs.loading) {
    return null
  }

  return (
    <CreatePositionContent
      initialInputs={initialInputs}
      paramsProtocolVersion={paramsProtocolVersion}
      autoSlippageTolerance={autoSlippageTolerance}
    />
  )
}

export default CreatePosition
