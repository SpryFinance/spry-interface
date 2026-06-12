/* oxlint-disable max-lines -- one cohesive module: every LP write flow's local builder lives here */
// SPRY: local calldata builders for the LP write flows on Base Sepolia. The
// Uniswap gateway Liquidity Service 401s there, so collect-fees / increase /
// decrease transactions (and the ERC20 approval check) are synthesized locally
// and returned through the same liquidityQueries seams, mirroring the swap
// local-rails pattern (spryLocalQuote / sprySwapApproval).
//
// SCOPE: today every Spry position is a RAW position - liquidity seeded through
// the canonical PoolModifyLiquidityTest router with salt = bytes32(owner EOA)
// and no NFT (the positions list synthesizes tokenIds "spry-raw-<poolId>|<tl>|
// <tu>|<router>"). The builders therefore target that router:
//
//   router.modifyLiquidity(poolKey, { tickLower, tickUpper, liquidityDelta,
//   salt = bytes32(wallet) }, hookData = 0x)
//
//   - collect fees: liquidityDelta = 0 (v4 credits accrued fees on any modify;
//     the router settles the deltas to msg.sender)
//   - decrease: negative delta from the live on-chain liquidity x percentage
//   - increase: positive delta sized with the v4 SDK from the entered amount;
//     ERC20 legs are pulled via transferFrom (hence the approval builder) and
//     a native ETH leg is sent as msg.value (the router refunds any excess)
//
// PositionManager NFT positions (none exist yet on Base Sepolia; the create
// flow that would mint them is still gateway-gapped) fall through to the
// gateway untouched - extend here with V4PositionManager calldata when that
// flow lands. The wallet signing these must be the position's original owner:
// the salt IS the owner address, and the positions list only shows a wallet
// its own positions, so this holds by construction.

import { getSpryConfig } from '@spry/config'
import { DYNAMIC_FEE_FLAG } from '@spry/fee'
import { poolId as computeSpryPoolId, sortCurrencies } from '@spry/sdk'
import { createSpryGraphClient, fetchPoolsByIds, type PositionPoolRow } from '@spry/subgraph'
import {
  ClaimFeesResponse,
  CreatePositionResponse,
  DecreasePositionResponse,
  IncreasePositionResponse,
  LPApprovalResponse,
  type ClaimFeesRequest,
  type CreatePositionRequest,
  type DecreasePositionRequest,
  type IncreasePositionRequest,
  type LPApprovalRequest,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/api_pb'
import { ApprovalTransactionRequest, LPToken } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/types_pb'
import type { PoolInfoRequest } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/api_pb'
import { PoolInfoResponse } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/api_pb'
import {
  PoolInformation,
  Protocols,
  TransactionRequest,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/types_pb'
import type { Currency } from '@uniswap/sdk-core'
import { Token } from '@uniswap/sdk-core'
import { Pool as V4Pool, Position as V4Position } from '@uniswap/v4-sdk'
import { encodeFunctionData, encodePacked, erc20Abi, keccak256, maxUint256, pad, toHex, type Address, type Hex } from 'viem'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { spryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

function isSameEvmAddress(a: string, b: string): boolean {
  return areAddressesEqual({
    addressInput1: { address: a, platform: Platform.EVM },
    addressInput2: { address: b, platform: Platform.EVM },
  })
}

const SPRY_RAW_TOKEN_ID_PREFIX = 'spry-raw-'
const SPRY_LP_CHAIN_ID = UniverseChainId.BaseSepolia
// Generous fixed limit; the wallet re-estimates at signing (and for increase the
// real estimate only succeeds once the approvals are mined).
const SPRY_LP_GAS_LIMIT = '600000'

const POOL_MODIFY_LIQUIDITY_TEST_ABI = [
  {
    type: 'function',
    name: 'modifyLiquidity',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'liquidityDelta', type: 'int256' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'delta', type: 'int256' }],
  },
] as const

const STATE_VIEW_ABI = [
  {
    type: 'function',
    name: 'getSlot0',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    type: 'function',
    name: 'getLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
  {
    type: 'function',
    name: 'getPositionInfo',
    stateMutability: 'view',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'positionId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
    ],
  },
] as const

interface RawPositionRef {
  poolId: Hex
  tickLower: number
  tickUpper: number
  router: Address
}

/** Parse the positions list's synthetic raw-position id; undefined for NFT tokenIds. */
function parseSpryRawTokenId(tokenId: string | undefined): RawPositionRef | undefined {
  if (!tokenId?.startsWith(SPRY_RAW_TOKEN_ID_PREFIX)) {
    return undefined
  }
  const [poolId, tickLowerRaw, tickUpperRaw, router] = tokenId.slice(SPRY_RAW_TOKEN_ID_PREFIX.length).split('|')
  const tickLower = Number(tickLowerRaw)
  const tickUpper = Number(tickUpperRaw)
  if (!poolId?.startsWith('0x') || !router?.startsWith('0x') || !Number.isInteger(tickLower) || !Number.isInteger(tickUpper)) {
    return undefined
  }
  return { poolId: poolId as Hex, tickLower, tickUpper, router: router as Address }
}

/** salt = bytes32(uint160(owner)) - the seeding scripts' per-owner salt scheme. */
function saltForOwner(owner: string): Hex {
  return pad(owner as Address, { size: 32 })
}

/** PoolManager position slot id: keccak256(abi.encodePacked(owner, tickLower, tickUpper, salt)). */
function positionSlot(ref: RawPositionRef, salt: Hex): Hex {
  return keccak256(encodePacked(['address', 'int24', 'int24', 'bytes32'], [ref.router, ref.tickLower, ref.tickUpper, salt]))
}

async function fetchSpryPool(poolId: Hex): Promise<PositionPoolRow> {
  const config = getSpryConfig(SPRY_LP_CHAIN_ID)
  if (!config?.subgraphUrl) {
    throw new Error('Spry LP: no subgraph configured for Base Sepolia')
  }
  const [pool] = await fetchPoolsByIds(createSpryGraphClient(config.subgraphUrl), [poolId])
  if (!pool) {
    throw new Error(`Spry LP: pool ${poolId} not found in the Spry subgraph`)
  }
  return pool
}

interface PoolKeyStruct {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

function poolKeyFromRow(pool: PositionPoolRow): PoolKeyStruct {
  return {
    currency0: pool.token0.id as Address,
    currency1: pool.token1.id as Address,
    fee: DYNAMIC_FEE_FLAG, // every Spry pool key uses the dynamic-fee flag (subgraph feeTier is the CURRENT fee)
    tickSpacing: Number.parseInt(pool.tickSpacing, 10),
    hooks: pool.hooks as Address,
  }
}

function encodeModifyLiquidity(args: {
  key: PoolKeyStruct
  tickLower: number
  tickUpper: number
  liquidityDelta: bigint
  salt: Hex
}): Hex {
  return encodeFunctionData({
    abi: POOL_MODIFY_LIQUIDITY_TEST_ABI,
    functionName: 'modifyLiquidity',
    args: [args.key, { tickLower: args.tickLower, tickUpper: args.tickUpper, liquidityDelta: args.liquidityDelta, salt: args.salt }, '0x'],
  })
}

function buildTxRequest(args: { to: string; from: string; data: Hex; value: bigint }): TransactionRequest {
  return new TransactionRequest({
    to: args.to,
    from: args.from,
    data: args.data,
    value: toHex(args.value),
    chainId: SPRY_LP_CHAIN_ID,
    gasLimit: SPRY_LP_GAS_LIMIT,
  })
}

/** True when this request is for the Spry chain (proto ChainId values are EIP-155 numbers). */
function isSpryLpChain(chainId: number): boolean {
  return Number(chainId) === SPRY_LP_CHAIN_ID
}

/**
 * Collect fees: modifyLiquidity with liquidityDelta = 0 credits the position's
 * accrued fees, which the router pays out to the caller.
 */
export async function maybeSpryLocalClaimFees(params: ClaimFeesRequest): Promise<ClaimFeesResponse | undefined> {
  const ref = parseSpryRawTokenId(params.tokenId)
  if (!isSpryLpChain(params.chainId) || !ref || !params.walletAddress) {
    return undefined
  }
  const pool = await fetchSpryPool(ref.poolId)
  const data = encodeModifyLiquidity({
    key: poolKeyFromRow(pool),
    tickLower: ref.tickLower,
    tickUpper: ref.tickUpper,
    liquidityDelta: BigInt(0),
    salt: saltForOwner(params.walletAddress),
  })
  return new ClaimFeesResponse({
    requestId: 'spry-local-claim',
    claim: buildTxRequest({ to: ref.router, from: params.walletAddress, data, value: BigInt(0) }),
  })
}

/** Decrease: negative delta = live on-chain liquidity x the requested percentage. */
export async function maybeSpryLocalDecreasePosition(
  params: DecreasePositionRequest,
): Promise<DecreasePositionResponse | undefined> {
  const ref = parseSpryRawTokenId(params.nftTokenId)
  if (!isSpryLpChain(params.chainId) || !ref || !params.walletAddress) {
    return undefined
  }
  const config = getSpryConfig(SPRY_LP_CHAIN_ID)
  if (!config) {
    return undefined
  }
  const salt = saltForOwner(params.walletAddress)
  const [pool, positionInfo] = await Promise.all([
    fetchSpryPool(ref.poolId),
    spryPublicClient.readContract({
      address: config.addresses.stateView,
      abi: STATE_VIEW_ABI,
      functionName: 'getPositionInfo',
      args: [ref.poolId, positionSlot(ref, salt)],
    }),
  ])
  const liquidity = positionInfo[0]
  // basis points so fractional percentages (e.g. 33.33) stay exact enough; 100% removes everything
  const percentBps = BigInt(Math.min(10_000, Math.max(0, Math.round(params.liquidityPercentageToDecrease * 100))))
  const liquidityDelta = -((liquidity * percentBps) / BigInt(10_000))
  if (liquidityDelta === BigInt(0)) {
    throw new Error('Spry LP: nothing to remove (zero live liquidity for this position)')
  }
  const data = encodeModifyLiquidity({
    key: poolKeyFromRow(pool),
    tickLower: ref.tickLower,
    tickUpper: ref.tickUpper,
    liquidityDelta,
    salt,
  })
  return new DecreasePositionResponse({
    requestId: 'spry-local-decrease',
    decrease: buildTxRequest({ to: ref.router, from: params.walletAddress, data, value: BigInt(0) }),
  })
}

function currencyForPoolToken(token: { id: string; decimals: string; symbol: string }, chainId: number): Currency {
  if (isSameEvmAddress(token.id, ZERO_ADDRESS)) {
    return nativeOnChain(chainId)
  }
  return new Token(chainId, token.id, Number.parseInt(token.decimals, 10), token.symbol)
}

/**
 * Increase: size the position with the v4 SDK from the entered (independent)
 * amount at the LIVE pool price, return both ceil mint amounts (the dependent
 * side feeds the form), and encode the positive-delta modify. A native ETH leg
 * rides as msg.value; ERC20 legs are pulled via transferFrom.
 */
export async function maybeSpryLocalIncreasePosition(
  params: IncreasePositionRequest,
): Promise<IncreasePositionResponse | undefined> {
  const ref = parseSpryRawTokenId(params.nftTokenId)
  const independent = params.independentToken
  if (!isSpryLpChain(params.chainId) || !ref || !params.walletAddress || !independent) {
    return undefined
  }
  const config = getSpryConfig(SPRY_LP_CHAIN_ID)
  if (!config) {
    return undefined
  }
  const pool = await fetchSpryPool(ref.poolId)
  const slot0 = await spryPublicClient.readContract({
    address: config.addresses.stateView,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: [ref.poolId],
  })

  const currency0 = currencyForPoolToken(pool.token0, SPRY_LP_CHAIN_ID)
  const currency1 = currencyForPoolToken(pool.token1, SPRY_LP_CHAIN_ID)
  const key = poolKeyFromRow(pool)
  const v4Pool = new V4Pool(
    currency0,
    currency1,
    key.fee,
    key.tickSpacing,
    key.hooks,
    slot0[0].toString(),
    '0', // pool-wide liquidity does not affect amount math
    slot0[1],
  )

  const independentIsToken0 = isSameEvmAddress(independent.tokenAddress, pool.token0.id)
  const independentIsToken1 = isSameEvmAddress(independent.tokenAddress, pool.token1.id)
  if (!independentIsToken0 && !independentIsToken1) {
    throw new Error('Spry LP: independent token is not part of this pool')
  }
  const position = independentIsToken0
    ? V4Position.fromAmount0({
        pool: v4Pool,
        tickLower: ref.tickLower,
        tickUpper: ref.tickUpper,
        amount0: independent.amount,
        useFullPrecision: true,
      })
    : V4Position.fromAmount1({
        pool: v4Pool,
        tickLower: ref.tickLower,
        tickUpper: ref.tickUpper,
        amount1: independent.amount,
      })
  const liquidityDelta = BigInt(position.liquidity.toString())
  if (liquidityDelta <= BigInt(0)) {
    throw new Error('Spry LP: amount too small to add measurable liquidity')
  }
  const { amount0, amount1 } = position.mintAmounts // ceil: what the router will actually pull

  const data = encodeModifyLiquidity({
    key,
    tickLower: ref.tickLower,
    tickUpper: ref.tickUpper,
    liquidityDelta,
    salt: saltForOwner(params.walletAddress),
  })
  const value = currency0.isNative ? BigInt(amount0.toString()) : BigInt(0)

  return new IncreasePositionResponse({
    requestId: 'spry-local-increase',
    token0: new LPToken({ tokenAddress: pool.token0.id, amount: amount0.toString() }),
    token1: new LPToken({ tokenAddress: pool.token1.id, amount: amount1.toString() }),
    increase: buildTxRequest({ to: ref.router, from: params.walletAddress, data, value }),
  })
}

/**
 * Approval check for the increase flow: read each ERC20 leg's allowance to the
 * PoolModifyLiquidityTest router and return a plain max approve when short.
 * Native legs need no approval; no permit2 is involved (the test router pulls
 * via transferFrom). NOTE: the approval request carries no tokenId, so this
 * keys purely on the chain - correct while every Base Sepolia position is a
 * raw router position; revisit when NFT positions (permit2 to PositionManager)
 * arrive.
 */
export async function maybeSpryLocalLPApproval(params: LPApprovalRequest): Promise<LPApprovalResponse | undefined> {
  if (!isSpryLpChain(params.chainId) || !params.walletAddress) {
    return undefined
  }
  const spender = getSpryConfig(SPRY_LP_CHAIN_ID)?.addresses.poolModifyLiquidityTest
  if (!spender) {
    return undefined
  }

  const erc20Legs = params.lpTokens.filter(
    (lpToken) =>
      lpToken.tokenAddress &&
      !isSameEvmAddress(lpToken.tokenAddress, ZERO_ADDRESS) &&
      BigInt(lpToken.amount || '0') > BigInt(0),
  )
  const allowances = await Promise.all(
    erc20Legs.map((lpToken) =>
      spryPublicClient.readContract({
        address: lpToken.tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [params.walletAddress as Address, spender],
      }),
    ),
  )

  const transactions: ApprovalTransactionRequest[] = []
  erc20Legs.forEach((lpToken, i) => {
    const allowance = allowances[i] ?? BigInt(0)
    if (allowance >= BigInt(lpToken.amount)) {
      return
    }
    const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, maxUint256] })
    transactions.push(
      new ApprovalTransactionRequest({
        // normalizeApprovalResponse matches these to token0/token1 by `transaction.to`
        transaction: buildTxRequest({ to: lpToken.tokenAddress, from: params.walletAddress, data: approveData, value: BigInt(0) }),
        cancelApproval: false,
        action: params.action,
      }),
    )
  })

  return new LPApprovalResponse({ requestId: 'spry-local-approval', transactions })
}

/** Min/max usable ticks for a tick spacing (Spry positions are always full range). */
function fullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const MAX_TICK = 887272
  return {
    tickLower: Math.ceil(-MAX_TICK / tickSpacing) * tickSpacing,
    tickUpper: Math.floor(MAX_TICK / tickSpacing) * tickSpacing,
  }
}

/**
 * Pool lookup for the create-position form ("does this pair + tier have a
 * pool, and at what price"). Computes the Spry poolId from the requested pair
 * + tick spacing (key fee is always the dynamic flag, hooks the SpryHook),
 * confirms it in the subgraph, and reads live slot0/liquidity from StateView.
 * pools: [] means "no such pool" (the form then enters create-new-pool mode).
 */
export async function maybeSpryLocalPoolInfo(params: PoolInfoRequest): Promise<PoolInfoResponse | undefined> {
  const poolParams = params.poolParameters
  if (Number(params.chainId) !== SPRY_LP_CHAIN_ID || !poolParams) {
    return undefined
  }
  const config = getSpryConfig(SPRY_LP_CHAIN_ID)
  if (!config) {
    return undefined
  }
  // A non-SpryHook (or hookless) pool config cannot exist on Spry.
  if (!poolParams.hookAddress || !isSameEvmAddress(poolParams.hookAddress, config.addresses.spryHook)) {
    return new PoolInfoResponse({ requestId: 'spry-local-poolinfo', pools: [] })
  }
  const tickSpacing = poolParams.tickSpacing
  if (!tickSpacing) {
    return new PoolInfoResponse({ requestId: 'spry-local-poolinfo', pools: [] })
  }

  const [currency0, currency1] = sortCurrencies(poolParams.tokenAddressA as Address, poolParams.tokenAddressB as Address)
  const id = computeSpryPoolId({
    currency0,
    currency1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing,
    hooks: config.addresses.spryHook,
  })

  const subgraphClient = createSpryGraphClient(config.subgraphUrl ?? '')
  const [pool] = config.subgraphUrl ? await fetchPoolsByIds(subgraphClient, [id]) : []
  if (!pool) {
    return new PoolInfoResponse({ requestId: 'spry-local-poolinfo', pools: [] })
  }

  const [slot0, poolLiquidity] = await Promise.all([
    spryPublicClient.readContract({
      address: config.addresses.stateView,
      abi: STATE_VIEW_ABI,
      functionName: 'getSlot0',
      args: [id],
    }),
    spryPublicClient.readContract({
      address: config.addresses.stateView,
      abi: STATE_VIEW_ABI,
      functionName: 'getLiquidity',
      args: [id],
    }),
  ])

  const aIsToken0 = isSameEvmAddress(poolParams.tokenAddressA, pool.token0.id)
  return new PoolInfoResponse({
    requestId: 'spry-local-poolinfo',
    pools: [
      new PoolInformation({
        poolReferenceIdentifier: id,
        poolProtocol: Protocols.V4,
        tokenAddressA: poolParams.tokenAddressA,
        tokenAddressB: poolParams.tokenAddressB,
        tokenDecimalsA: aIsToken0 ? pool.token0.decimals : pool.token1.decimals,
        tokenDecimalsB: aIsToken0 ? pool.token1.decimals : pool.token0.decimals,
        fee: DYNAMIC_FEE_FLAG, // the pool-key fee (consumers build the SDK pool from it)
        tickSpacing,
        hookAddress: config.addresses.spryHook,
        chainId: SPRY_LP_CHAIN_ID,
        sqrtRatioX96: slot0[0].toString(),
        currentTick: slot0[1],
        poolLiquidity: poolLiquidity.toString(),
      }),
    ],
  })
}

/**
 * Create a position in an EXISTING Spry pool: same router modify as increase,
 * but addressed by the form's poolReference (set by maybeSpryLocalPoolInfo to
 * the v4 poolId) and always full range for the pool's tick spacing. Brand-new
 * pool initialization is not supported from the UI on testnet (Spry pools are
 * deployed with the hook's tier config), so the newPool case throws a clear
 * error instead of silently 401ing.
 */
export async function maybeSpryLocalCreatePosition(
  params: CreatePositionRequest,
): Promise<CreatePositionResponse | undefined> {
  const independent = params.independentToken
  if (!isSpryLpChain(params.chainId) || !params.walletAddress || !independent) {
    return undefined
  }
  const config = getSpryConfig(SPRY_LP_CHAIN_ID)
  const router = config?.addresses.poolModifyLiquidityTest
  if (!config || !router) {
    return undefined
  }
  if (params.pool.case === 'newPool') {
    throw new Error(
      'Spry: this pair + tier has no pool yet, and initializing new pools from the UI is not supported on testnet. Pick a pair with an existing Spry pool.',
    )
  }
  if (params.pool.case !== 'existingPool' || !params.pool.value.poolReference.startsWith('0x')) {
    return undefined
  }
  const poolIdRef = params.pool.value.poolReference as Hex

  const pool = await fetchSpryPool(poolIdRef)
  const slot0 = await spryPublicClient.readContract({
    address: config.addresses.stateView,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: [poolIdRef],
  })

  const currency0 = currencyForPoolToken(pool.token0, SPRY_LP_CHAIN_ID)
  const currency1 = currencyForPoolToken(pool.token1, SPRY_LP_CHAIN_ID)
  const key = poolKeyFromRow(pool)
  const { tickLower, tickUpper } = fullRangeTicks(key.tickSpacing)
  const v4Pool = new V4Pool(
    currency0,
    currency1,
    key.fee,
    key.tickSpacing,
    key.hooks,
    slot0[0].toString(),
    '0',
    slot0[1],
  )

  const independentIsToken0 = isSameEvmAddress(independent.tokenAddress, pool.token0.id)
  const independentIsToken1 = isSameEvmAddress(independent.tokenAddress, pool.token1.id)
  if (!independentIsToken0 && !independentIsToken1) {
    throw new Error('Spry LP: independent token is not part of this pool')
  }
  const position = independentIsToken0
    ? V4Position.fromAmount0({ pool: v4Pool, tickLower, tickUpper, amount0: independent.amount, useFullPrecision: true })
    : V4Position.fromAmount1({ pool: v4Pool, tickLower, tickUpper, amount1: independent.amount })
  const liquidityDelta = BigInt(position.liquidity.toString())
  if (liquidityDelta <= BigInt(0)) {
    throw new Error('Spry LP: amount too small to add measurable liquidity')
  }
  const { amount0, amount1 } = position.mintAmounts

  const data = encodeModifyLiquidity({
    key,
    tickLower,
    tickUpper,
    liquidityDelta,
    salt: saltForOwner(params.walletAddress),
  })
  const value = currency0.isNative ? BigInt(amount0.toString()) : BigInt(0)

  return new CreatePositionResponse({
    requestId: 'spry-local-create',
    token0: new LPToken({ tokenAddress: pool.token0.id, amount: amount0.toString() }),
    token1: new LPToken({ tokenAddress: pool.token1.id, amount: amount1.toString() }),
    tickLower,
    tickUpper,
    create: buildTxRequest({ to: router, from: params.walletAddress, data, value }),
  })
}
