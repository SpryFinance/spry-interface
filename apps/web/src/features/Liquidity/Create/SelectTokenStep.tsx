/* oxlint-disable max-lines */

import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { Currency } from '@uniswap/sdk-core'
import type { Pool as V4Pool } from '@uniswap/v4-sdk'
import {
  AllowedV4WethHookAddressesConfigKey,
  DynamicConfigs,
  useDynamicConfigValue,
} from '@universe/gating'
import { getSpryConfig } from '@spry/config'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router'
import type { FlexProps } from 'ui/src'
import { Button, DropdownButton, Flex, Shine, Text } from 'ui/src'
import { iconSizes } from 'ui/src/theme'
import { TokenLogo } from 'uniswap/src/components/CurrencyLogo/TokenLogo'
import { TokenSelectorFlow } from 'uniswap/src/components/TokenSelector/types'
import { nativeOnChain, WRAPPED_NATIVE_CURRENCY } from 'uniswap/src/constants/tokens'
import { useEnabledChains } from 'uniswap/src/features/chains/hooks/useEnabledChains'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import type { FeeData } from 'uniswap/src/features/positions/types'
import { LiquidityEventName, ModalName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { FeePoolSelectAction } from 'uniswap/src/features/telemetry/types'
import { useCurrencyInfo } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { areCurrenciesEqual, currencyId } from 'uniswap/src/utils/currencyId'
import { useTrace } from 'utilities/src/telemetry/trace/TraceContext'
import { PrefetchBalancesWrapper } from '~/appGraphql/data/apollo/AdaptiveTokenBalancesProvider'
import { ErrorCallout } from '~/components/ErrorCallout'
import { DoubleCurrencyLogo } from '~/components/Logo/DoubleLogo'
import { CurrencySearchModal } from '~/components/SearchModal/CurrencySearchModal'
import { CreatingPoolInfo, PoolAlreadyCreatedInfo } from '~/features/Liquidity/Create/CreatingPoolInfo'
import { useLiquidityUrlState } from '~/features/Liquidity/Create/hooks/useLiquidityUrlState'
import { PoolParsingError } from '~/features/Liquidity/Create/PoolParsingError'
import { buildEmptySpryPosition } from '~/features/Liquidity/spry/buildEmptySpryPosition'
import { SpryTierSelector } from '~/features/Liquidity/spry/SpryTierSelector'
import { useSpryWalletPositions } from '~/features/Liquidity/spry/useSpryWalletPositions'
import { hasLPFoTTransferError } from '~/features/Liquidity/utils/hasLPFoTTransferError'
import { isUnsupportedLPChain } from '~/features/Liquidity/utils/isUnsupportedLPChain'
import { serializeSwapStateToURLParameters } from '~/features/Swap/state/swap/tradeQueryParams'
import { useAccount } from '~/hooks/useAccount'
import { SUPPORTED_V2POOL_CHAIN_IDS } from '~/hooks/useNetworkSupportsV2'
import { useCreateLiquidityContext } from '~/pages/CreatePosition/CreateLiquidityContextProvider'
import { setOpenModal } from '~/state/application/reducer'
import { useMultichainContext } from '~/state/multichain/useMultichainContext'
import { SwitchNetworkAction } from '~/state/popups/types'
import { isV4UnsupportedChain } from '~/utils/networkSupportsV4'

interface WrappedNativeWarning {
  wrappedToken: Currency
  nativeToken: Currency
  swapUrlParams: string
}

export const CurrencySelector = ({
  loading,
  currencyInfo,
  onPress,
  placeholder,
  emphasis = 'primary',
}: {
  loading?: boolean
  currencyInfo: Maybe<CurrencyInfo>
  onPress: () => void
  placeholder?: string
  emphasis?: 'primary' | 'tertiary'
}) => {
  const { t } = useTranslation()
  const currency = currencyInfo?.currency
  const emptyTextColor = emphasis === 'tertiary' ? '$neutral2' : '$surface1'

  return loading ? (
    <Shine width="100%">
      <Flex backgroundColor="$surface3" borderRadius="$rounded16" height={50} />
    </Shine>
  ) : (
    <DropdownButton
      emphasis={currencyInfo ? undefined : emphasis}
      onPress={onPress}
      elementPositioning="grouped"
      isExpanded={false}
      icon={
        currency ? (
          <TokenLogo
            size={iconSizes.icon24}
            chainId={currency.chainId}
            name={currency.name}
            symbol={currency.symbol}
            url={currencyInfo.logoUrl}
          />
        ) : undefined
      }
    >
      <DropdownButton.Text color={currency ? '$neutral1' : emptyTextColor}>
        {currency ? currency.symbol : (placeholder ?? t('fiatOnRamp.button.chooseToken'))}
      </DropdownButton.Text>
    </DropdownButton>
  )
}

const DEFAULT_ADDRESSES: string[] = [] // this has to be a const to prevent a rerender loop

// oxlint-disable-next-line complexity
export function SelectTokensStep({
  currencyInputs,
  setCurrencyInputs,
  onContinue,
  tokensLocked,
  ...rest
}: {
  tokensLocked?: boolean
  onContinue: () => void
  currencyInputs: { tokenA: Maybe<Currency>; tokenB: Maybe<Currency> }
  setCurrencyInputs: Dispatch<SetStateAction<{ tokenA: Maybe<Currency>; tokenB: Maybe<Currency> }>>
} & FlexProps) {
  const { loadingA, loadingB } = useLiquidityUrlState()
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const { setSelectedChainId, setIsUserSelectedToken } = useMultichainContext()
  const trace = useTrace()
  const [showWrappedNativeWarning, setShowWrappedNativeWarning] = useState(false)
  const allowedV4WethHookAddresses: string[] = useDynamicConfigValue({
    config: DynamicConfigs.AllowedV4WethHookAddresses,
    key: AllowedV4WethHookAddressesConfigKey.HookAddresses,
    defaultValue: DEFAULT_ADDRESSES,
  })

  const {
    positionState: { hook, userApprovedHook, fee, migratingPosition },
    setPositionState,
    protocolVersion,
    creatingPoolOrPair,
    poolOrPairLoading,
    poolOrPair,
    poolId,
  } = useCreateLiquidityContext()

  const token0 = currencyInputs.tokenA
  const token1 = currencyInputs.tokenB
  const [currencySearchInputState, setCurrencySearchInputState] = useState<'tokenA' | 'tokenB' | undefined>(undefined)

  const isToken0Unsupported = isUnsupportedLPChain(token0?.chainId, protocolVersion)
  const isToken1Unsupported = isUnsupportedLPChain(token1?.chainId, protocolVersion)
  const unsupportedChainId = isToken0Unsupported ? token0?.chainId : isToken1Unsupported ? token1?.chainId : undefined
  const isUnsupportedTokenSelected = isToken0Unsupported || isToken1Unsupported

  const handleCurrencySelect = useCallback(
    (currency: Currency) => {
      if (currencySearchInputState === undefined) {
        return
      }

      const otherInputState = currencySearchInputState === 'tokenA' ? 'tokenB' : 'tokenA'
      const otherCurrency = currencyInputs[otherInputState]
      const wrappedCurrencyNew = currency.isNative ? currency.wrapped : currency
      const wrappedCurrencyOther = otherCurrency?.isNative ? otherCurrency.wrapped : otherCurrency

      setSelectedChainId(currency.chainId)

      // If the tokens change, reset the fee tier so the user re-picks a Spry tier for the new pair.
      setPositionState((prevState) => ({ ...prevState, fee: undefined }))

      if (areCurrenciesEqual(currency, otherCurrency) || areCurrenciesEqual(wrappedCurrencyNew, wrappedCurrencyOther)) {
        setCurrencyInputs((prevState) => ({
          ...prevState,
          [otherInputState]: undefined,
          [currencySearchInputState]: currency,
        }))
        return
      }

      if (otherCurrency && otherCurrency.chainId !== currency.chainId) {
        setCurrencyInputs((prevState) => ({
          ...prevState,
          [otherInputState]: undefined,
          [currencySearchInputState]: currency,
        }))
        return
      }

      switch (currencySearchInputState) {
        case 'tokenA':
        case 'tokenB':
          setCurrencyInputs((prevState) => ({
            ...prevState,
            [currencySearchInputState]: currency,
          }))
          break
        default:
          break
      }
    },
    [currencySearchInputState, setCurrencyInputs, currencyInputs, setSelectedChainId, setPositionState],
  )

  // SPRY: selecting a tier ALSO pins the SpryHook (pre-approved, so the unknown-hook modal never
  // fires) - the tier + hook together identify the Spry pool the form looks up and targets.
  const handleSpryTierSelect = useCallback(
    (feeData: FeeData) => {
      const spryHookAddress = getSpryConfig(token0?.chainId ?? UniverseChainId.BaseSepolia)?.addresses.spryHook
      setPositionState((prevState) => ({
        ...prevState,
        fee: feeData,
        hook: spryHookAddress,
        userApprovedHook: spryHookAddress,
      }))
      sendAnalyticsEvent(LiquidityEventName.SelectLiquidityPoolFeeTier, {
        action: FeePoolSelectAction.Manual,
        fee_tier: feeData.feeAmount,
        ...trace,
      })
    },
    [setPositionState, trace, token0?.chainId],
  )

  const { chains } = useEnabledChains({ platform: Platform.EVM })
  const supportedChains = useMemo(() => {
    return protocolVersion === ProtocolVersion.V4
      ? chains.filter((chain) => !isV4UnsupportedChain(chain))
      : protocolVersion === ProtocolVersion.V2
        ? chains.filter((chain) => SUPPORTED_V2POOL_CHAIN_IDS.includes(chain))
        : undefined
  }, [protocolVersion, chains])

  const handleOpenTokenSelector = useCallback(
    (inputState: 'tokenA' | 'tokenB') => {
      const otherToken = inputState === 'tokenA' ? token1 : token0
      if (otherToken?.chainId) {
        setSelectedChainId(otherToken.chainId)
        setIsUserSelectedToken(true)
      }
      setCurrencySearchInputState(inputState)
    },
    [token0, token1, setSelectedChainId, setIsUserSelectedToken],
  )

  // SPRY: adding liquidity to an EXISTING pool + tier goes through the shared
  // Add-liquidity modal (the same one the positions list opens), NOT step 2 +
  // the create review. The modal gets the wallet's live position in that pool
  // when one exists, or a zero-liquidity raw stand-in whose synthetic tokenId
  // points the local increase rails at the router (the first add mints it).
  const walletAddress = useAccount().address
  const { positions: spryWalletPositions } = useSpryWalletPositions({
    address: walletAddress,
    chainFilter: null,
  })

  const openExistingPoolAddLiquidity = (): boolean => {
    if (!poolId || !poolOrPair || protocolVersion !== ProtocolVersion.V4 || !walletAddress) {
      return false
    }
    // oxlint-disable-next-line universe-custom/no-tolowercase-address-currencyid -- bytes32 poolIds (not addresses), compared in subgraph (lowercase) casing
    const inThisPool = spryWalletPositions.filter((position) => position.poolId.toLowerCase() === poolId.toLowerCase())
    const existing =
      inThisPool.find((position) => position.status !== PositionStatus.CLOSED && String(position.tokenId).startsWith('spry-raw-')) ??
      inThisPool.find((position) => position.status !== PositionStatus.CLOSED) ??
      inThisPool.at(0)
    const positionInfo =
      existing ?? buildEmptySpryPosition({ pool: poolOrPair as V4Pool, poolId, owner: walletAddress })
    if (!positionInfo) {
      return false
    }
    dispatch(setOpenModal({ name: ModalName.AddLiquidity, initialState: positionInfo }))
    return true
  }

  const handleOnContinue = () => {
    if (poolAlreadyExists && openExistingPoolAddLiquidity()) {
      return
    }

    if (wrappedNativeWarning) {
      setShowWrappedNativeWarning(true)
      return
    }

    // SPRY: the only hook on Spry is the SpryHook, pinned and pre-approved by the
    // tier selector, so the "Adding hook" speedbump never applies. Auto-approve any
    // not-yet-approved hook and continue instead of ever showing that modal (which is
    // pruned from the render below). RESTORE FOR MAINNET (allow arbitrary hooks): bring
    // back the HookModal render + `if (hook !== userApprovedHook) setHookModalOpen(true)`.
    if (hook && hook !== userApprovedHook) {
      setPositionState((state) => ({ ...state, userApprovedHook: hook }))
    }
    onContinue()
  }

  const wrappedNativeWarning = useMemo((): WrappedNativeWarning | undefined => {
    if (protocolVersion !== ProtocolVersion.V4) {
      setShowWrappedNativeWarning(false)
      return undefined
    }

    // Only enforce native ETH on pool creation; allow WETH when adding liquidity to an existing pool.
    if (!creatingPoolOrPair) {
      return undefined
    }

    if (hook && allowedV4WethHookAddresses.includes(hook)) {
      return undefined
    }

    const wethToken0 = token0 && WRAPPED_NATIVE_CURRENCY[token0.chainId]
    if (token0 && wethToken0?.equals(token0)) {
      const nativeToken = nativeOnChain(token0.chainId)
      return {
        wrappedToken: token0,
        nativeToken,
        swapUrlParams: serializeSwapStateToURLParameters({
          chainId: token0.chainId,
          inputCurrency: token0,
          outputCurrency: nativeToken,
        }),
      }
    }

    const wethToken1 = token1 && WRAPPED_NATIVE_CURRENCY[token1.chainId]
    if (token1 && wethToken1?.equals(token1)) {
      const nativeToken = nativeOnChain(token1.chainId)
      return {
        wrappedToken: token1,
        nativeToken,
        swapUrlParams: serializeSwapStateToURLParameters({
          chainId: token1.chainId,
          inputCurrency: token1,
          outputCurrency: nativeToken,
        }),
      }
    }

    setShowWrappedNativeWarning(false)
    return undefined
  }, [token0, token1, protocolVersion, hook, allowedV4WethHookAddresses, creatingPoolOrPair])

  const token0CurrencyInfo = useCurrencyInfo(currencyId(token0))
  const token1CurrencyInfo = useCurrencyInfo(currencyId(token1))

  const token0FoTError = hasLPFoTTransferError(token0CurrencyInfo, protocolVersion)
  const token1FoTError = hasLPFoTTransferError(token1CurrencyInfo, protocolVersion)
  const fotErrorToken = token0FoTError || token1FoTError

  const hasError = isUnsupportedTokenSelected || Boolean(fotErrorToken)

  // SPRY: not gated on the AddLiquidityRevamp flag - existing pools ALWAYS
  // route to the Add-liquidity modal on Spry.
  const poolAlreadyExists =
    !migratingPosition && !creatingPoolOrPair && !!poolOrPair && !!poolId && !!token0 && !!token1 && !!fee

  return (
    // SPRY: the "Adding hook" speedbump modal is pruned for the testnet phase (every Spry
    // position uses the pre-approved SpryHook). See handleOnContinue for the auto-approve +
    // the mainnet-restore note.
    <PrefetchBalancesWrapper>
        <Flex gap="$spacing32" {...rest}>
          <Flex gap="$spacing16">
            <Flex gap="$spacing12">
              <Flex>
                <Text variant="subheading1">{tokensLocked ? t('pool.tokenPair') : t('pool.selectPair')}</Text>
                <Text variant="body3" color="$neutral2">
                  {tokensLocked ? t('position.migrate.liquidity') : t('position.provide.liquidity')}
                </Text>
              </Flex>
              {tokensLocked && token0 && token1 ? (
                <Flex row gap="$gap16" py="$spacing4" alignItems="center">
                  <DoubleCurrencyLogo currencies={[token0, token1]} size={44} />
                  <Flex grow>
                    <Text variant="heading3">
                      {token0.symbol} / {token1.symbol}
                    </Text>
                  </Flex>
                </Flex>
              ) : (
                <Flex row gap="$gap16" $md={{ flexDirection: 'column' }}>
                  <Flex row flex={1} flexBasis={0} $md={{ flexBasis: 'auto' }}>
                    <CurrencySelector
                      loading={loadingA}
                      currencyInfo={token0CurrencyInfo}
                      onPress={() => handleOpenTokenSelector('tokenA')}
                    />
                  </Flex>
                  <Flex row flex={1} flexBasis={0} $md={{ flexBasis: 'auto' }}>
                    <CurrencySelector
                      loading={loadingB}
                      currencyInfo={token1CurrencyInfo}
                      onPress={() => handleOpenTokenSelector('tokenB')}
                    />
                  </Flex>
                </Flex>
              )}
              <SelectStepError
                isUnsupportedTokenSelected={isUnsupportedTokenSelected}
                unsupportedChainId={unsupportedChainId}
                protocolVersion={protocolVersion}
                wrappedNativeWarning={undefined}
                fotToken={fotErrorToken}
              />
              {/* SPRY: the "Add a Hook" option is pruned - every Spry pool uses the SpryHook, which the
                  tier selector pins automatically. Restore <AddHook /> from git history if arbitrary
                  hooks ever return. */}
            </Flex>
          </Flex>
          <Flex gap="$spacing24">
            <Flex>
              <Text variant="subheading1">Dynamic fee tier</Text>
              <Text variant="body3" color="$neutral2">
                Every Spry pool charges a dynamic fee that moves within its tier's band as volatility and
                imbalance change. Pick the tier that matches the pair.
              </Text>
            </Flex>

            {/* SPRY: the five Spry tiers replace the stock fee-tier grid; the custom fee-tier search
                ("Search or create other fee tiers") is pruned - Spry pools only exist at these tiers. */}
            <SpryTierSelector
              selectedFee={fee}
              onSelect={(_tier, feeData) => handleSpryTierSelect(feeData)}
              disabled={
                hasError || !currencyInputs.tokenA || !currencyInputs.tokenB || Boolean(migratingPosition?.isOutOfRange)
              }
            />
          </Flex>
          {poolAlreadyExists ? <PoolAlreadyCreatedInfo /> : <CreatingPoolInfo />}
          <Flex row>
            <Button
              size="large"
              key="SelectTokensStep-continue"
              onPress={handleOnContinue}
              loading={Boolean(poolOrPairLoading && token0 && token1 && fee)}
              isDisabled={
                !(creatingPoolOrPair || poolOrPair) || hasError || (showWrappedNativeWarning && !!wrappedNativeWarning)
              }
            >
              {poolAlreadyExists ? t('common.addLiquidity') : t('common.button.continue')}
            </Button>
          </Flex>
          <PoolParsingError formComplete={Boolean(token0 && token1 && fee)} />
          {showWrappedNativeWarning && wrappedNativeWarning && (
            <SelectStepError
              isUnsupportedTokenSelected={false}
              protocolVersion={protocolVersion}
              wrappedNativeWarning={wrappedNativeWarning}
              fotToken={undefined}
            />
          )}
        </Flex>

        <CurrencySearchModal
          isOpen={currencySearchInputState !== undefined}
          onDismiss={() => setCurrencySearchInputState(undefined)}
          switchNetworkAction={SwitchNetworkAction.LP}
          onCurrencySelect={handleCurrencySelect}
          chainIds={supportedChains}
          flow={TokenSelectorFlow.Liquidity}
        />
    </PrefetchBalancesWrapper>
  )
}

function SelectStepError({
  isUnsupportedTokenSelected,
  unsupportedChainId,
  protocolVersion,
  wrappedNativeWarning,
  fotToken,
}: {
  isUnsupportedTokenSelected: boolean
  unsupportedChainId?: UniverseChainId
  protocolVersion: ProtocolVersion
  wrappedNativeWarning?: WrappedNativeWarning
  fotToken?: CurrencyInfo
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (isUnsupportedTokenSelected) {
    return (
      <ErrorCallout
        errorMessage={true}
        title={
          unsupportedChainId === UniverseChainId.Solana
            ? t('position.create.unsupportedSolana')
            : protocolVersion === ProtocolVersion.V2
              ? t('position.create.v2unsupportedChain')
              : t('position.migrate.v4unsupportedChain')
        }
        description={
          unsupportedChainId === UniverseChainId.Solana
            ? t('position.create.unsupportedSolana.description')
            : t('position.create.unsupportedToken.description')
        }
      />
    )
  }

  if (wrappedNativeWarning) {
    return (
      <ErrorCallout
        isWarning
        errorMessage={true}
        title={t('position.wrapped.warning', { nativeToken: wrappedNativeWarning.nativeToken.symbol })}
        description={t('position.wrapped.warning.info', {
          nativeToken: wrappedNativeWarning.nativeToken.symbol,
          wrappedToken: wrappedNativeWarning.wrappedToken.symbol,
        })}
        action={t('position.wrapped.unwrap', { wrappedToken: wrappedNativeWarning.wrappedToken.symbol })}
        onPress={() => navigate(`/swap${wrappedNativeWarning.swapUrlParams}`)}
      />
    )
  }

  if (fotToken) {
    // SPRY: v4-only - no v2 fallback for fee-on-transfer tokens, so just warn (no switch-to-v2 action).
    return (
      <ErrorCallout
        errorMessage={true}
        title={t('token.safety.warning.fotLow.title')}
        description={t('position.fot.warning', { token: fotToken.currency.symbol })}
      />
    )
  }

  return null
}
