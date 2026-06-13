/* oxlint-disable max-lines -- one cohesive module: every LP write flow's local builder lives here */
// SPRY: local calldata builders for the LP write flows on the Spry chains. The
// Uniswap gateway Liquidity Service 401s there, so collect-fees / increase /
// decrease / create transactions (and the ERC20 approval check) are synthesized
// locally and returned through the same liquidityQueries seams, mirroring the
// swap local-rails pattern (spryLocalQuote / sprySwapApproval). Every entry
// point reads its chain from `params.chainId` (the request carries it) and
// gates on `isSpryChain`, so all flows work on every Spry-deployed chain.
//
// SCOPE: two position kinds exist on each Spry chain and both are handled here.
//
// RAW positions (liquidity seeded through the canonical PoolModifyLiquidityTest
// router with salt = bytes32(owner EOA), no NFT; the positions list synthesizes
// tokenIds "spry-raw-<poolId>|<tl>|<tu>|<router>"). Builders target the router:
//
//   router.modifyLiquidity(poolKey, { tickLower, tickUpper, liquidityDelta,
//   salt = bytes32(wallet) }, hookData = 0x)
//
//   - collect fees: liquidityDelta = 0 (v4 credits accrued fees on any modify;
//     the router settles the deltas to msg.sender)
//   - decrease: negative delta from the live on-chain liquidity x percentage
//   - increase: positive delta sized with the v4 SDK from the entered amount;
//     ERC20 legs are pulled via transferFrom (hence the plain approve-to-router
//     in the approval builder) and a native ETH leg is sent as msg.value (the
//     router refunds any excess)
//
// NFT positions (PositionManager ERC-721s, minted by the create flow below or
// by third parties). Builders use @uniswap/v4-sdk V4PositionManager calldata:
//
//   - create (NEW pool): addCallParameters with createPool, which multicalls
//     initializePool(key, sqrtPriceX96) + a full-range mint in ONE transaction.
//     ERC20 legs settle through Permit2, so the approval builder's CREATE
//     branch emits up to two txs per leg: ERC20.approve(Permit2) (matched to
//     the token0/token1Approval slots by `to`) and Permit2.approve(token, posm)
//     (to = Permit2, which normalizeApprovalResponse routes into the
//     token0/token1PermitTransaction slots; the LP saga executes both before
//     the create). Creating a position in an EXISTING pool never reaches this
//     module from the UI - the create page routes existing pools into the
//     shared Add-liquidity modal instead.
//   - collect / decrease: collectCallParameters / removeCallParameters by
//     tokenId (payout-only, so no approvals).
//   - increase: routed through the RAW router path at the NFT's range (the
//     liquidity lands in a sibling raw position keyed by the wallet's salt).
//     This keeps the approval story uniform - the approval request carries no
//     tokenId, so it cannot know posm/Permit2 vs router per position.
//
// The wallet signing the raw builders must be the position's original owner:
// the salt IS the owner address, and the positions list only shows a wallet
// its own positions, so this holds by construction.

import { getSpryConfig, isSpryChain } from '@spry/config'
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
import {
  ApprovalTransactionRequest,
  LPAction,
  LPToken,
  type CreatePoolParameters,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v2/types_pb'
import type { PoolInfoRequest } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/api_pb'
import { PoolInfoResponse } from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/api_pb'
import {
  PoolInformation,
  Protocols,
  TransactionRequest,
} from '@uniswap/client-liquidity/dist/uniswap/liquidity/v1/types_pb'
import { permit2Address } from '@uniswap/permit2-sdk'
import type { Currency } from '@uniswap/sdk-core'
import { Percent, Token } from '@uniswap/sdk-core'
import { TickMath } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Position as V4Position, V4PositionManager } from '@uniswap/v4-sdk'
import JSBI from 'jsbi'
import {
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  getAddress,
  keccak256,
  maxUint160,
  maxUint256,
  pad,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { nativeOnChain } from 'uniswap/src/constants/tokens'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { Platform } from 'uniswap/src/features/platforms/types/Platform'
import { getSpryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'

function isSameEvmAddress(a: string, b: string): boolean {
  return areAddressesEqual({
    addressInput1: { address: a, platform: Platform.EVM },
    addressInput2: { address: b, platform: Platform.EVM },
  })
}

const SPRY_RAW_TOKEN_ID_PREFIX = 'spry-raw-'
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

const POSITION_MANAGER_LP_ABI = [
  {
    type: 'function',
    name: 'getPoolAndPositionInfo',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'info', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getPositionLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const

const PERMIT2_LP_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const

const MAX_UINT48 = BigInt('0xffffffffffff')

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

/** Parse a PositionManager NFT tokenId (plain decimal digits); undefined for raw/synthetic ids. */
function parseNftTokenId(tokenId: string | undefined): bigint | undefined {
  return tokenId && /^\d+$/.test(tokenId) ? BigInt(tokenId) : undefined
}

/**
 * Sign-extend the int24 fields packed inside PositionManager's PositionInfo
 * word (modulo/division instead of mask/shift: this package lints no-bitwise,
 * and they are equivalent on non-negative bigints).
 */
function toInt24(value: bigint): number {
  const masked = value % BigInt(0x1000000)
  return Number(masked >= BigInt(0x800000) ? masked - BigInt(0x1000000) : masked)
}

interface NftPositionState {
  key: PoolKeyStruct
  poolId: Hex
  tickLower: number
  tickUpper: number
  liquidity: bigint
  sqrtPriceX96: bigint
  tick: number
}

/** Live pool key + range + liquidity + price for a PositionManager NFT position. */
async function fetchNftPositionState(chainId: number, tokenId: bigint): Promise<NftPositionState> {
  const config = getSpryConfig(chainId)
  if (!config) {
    throw new Error(`Spry LP: no Spry config for chain ${chainId}`)
  }
  const client = getSpryPublicClient(chainId)
  const posm = config.addresses.positionManager
  const [keyAndInfo, liquidity] = await Promise.all([
    client.readContract({
      address: posm,
      abi: POSITION_MANAGER_LP_ABI,
      functionName: 'getPoolAndPositionInfo',
      args: [tokenId],
    }),
    client.readContract({
      address: posm,
      abi: POSITION_MANAGER_LP_ABI,
      functionName: 'getPositionLiquidity',
      args: [tokenId],
    }),
  ])
  const [rawKey, infoPacked] = keyAndInfo
  // a burned/nonexistent tokenId reads back an all-zero key
  if (rawKey.tickSpacing === 0) {
    throw new Error(`Spry LP: position ${tokenId} does not exist (burned?)`)
  }
  const key: PoolKeyStruct = {
    currency0: rawKey.currency0,
    currency1: rawKey.currency1,
    fee: rawKey.fee,
    tickSpacing: rawKey.tickSpacing,
    hooks: rawKey.hooks,
  }
  const poolId = computeSpryPoolId({
    currency0: key.currency0,
    currency1: key.currency1,
    fee: key.fee,
    tickSpacing: key.tickSpacing,
    hooks: key.hooks,
  })
  const slot0 = await client.readContract({
    address: config.addresses.stateView,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: [poolId],
  })
  return {
    key,
    poolId,
    tickLower: toInt24(infoPacked / BigInt(0x100)), // info >> 8
    tickUpper: toInt24(infoPacked / BigInt(0x100000000)), // info >> 32
    liquidity,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
  }
}

/** SDK Currency pair for a pool key, reading ERC20 decimals live (symbols are display-only here). */
async function currenciesForPoolKey(chainId: number, key: PoolKeyStruct): Promise<[Currency, Currency]> {
  const erc20Legs = [key.currency0, key.currency1].filter((address) => !isSameEvmAddress(address, ZERO_ADDRESS))
  const decimalsResults = await getSpryPublicClient(chainId).multicall({
    contracts: erc20Legs.map((address) => ({
      address: getAddress(address),
      abi: erc20Abi,
      functionName: 'decimals' as const,
    })),
    allowFailure: false,
  })
  const decimalsByAddress = new Map(erc20Legs.map((address, i) => [normalizeTokenAddressForCache(address), decimalsResults[i]]))
  const toCurrency = (address: string): Currency =>
    isSameEvmAddress(address, ZERO_ADDRESS)
      ? nativeOnChain(chainId)
      : new Token(chainId, address, decimalsByAddress.get(normalizeTokenAddressForCache(address)) ?? 18)
  return [toCurrency(key.currency0), toCurrency(key.currency1)]
}

function v4PoolFromState(args: {
  currency0: Currency
  currency1: Currency
  key: PoolKeyStruct
  sqrtPriceX96: bigint | string
  tick: number
}): V4Pool {
  return new V4Pool(
    args.currency0,
    args.currency1,
    args.key.fee,
    args.key.tickSpacing,
    args.key.hooks,
    args.sqrtPriceX96.toString(),
    '0', // pool-wide liquidity does not affect amount math
    args.tick,
  )
}

/** Form slippage is in percent units (e.g. 2.5); the SDK wants a Percent. */
function percentFromSlippage(slippageTolerance: number | undefined): Percent {
  const bps = Math.round((slippageTolerance ?? 2.5) * 100)
  return new Percent(Math.max(0, Math.min(10_000, bps)), 10_000)
}

function deadlineOrDefault(deadline: number | undefined): string {
  return String(deadline && deadline > 0 ? deadline : Math.floor(Date.now() / 1000) + 1200)
}

async function fetchSpryPool(chainId: number, poolId: Hex): Promise<PositionPoolRow> {
  const config = getSpryConfig(chainId)
  if (!config?.subgraphUrl) {
    throw new Error(`Spry LP: no subgraph configured for chain ${chainId}`)
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

function buildTxRequest(args: {
  chainId: number
  to: string
  from: string
  data: Hex
  value: bigint
  gasLimit?: string
}): TransactionRequest {
  return new TransactionRequest({
    to: args.to,
    from: args.from,
    data: args.data,
    value: toHex(args.value),
    chainId: args.chainId,
    gasLimit: args.gasLimit ?? SPRY_LP_GAS_LIMIT,
  })
}

/**
 * Collect fees.
 * - raw positions: modifyLiquidity with liquidityDelta = 0 credits the
 *   position's accrued fees, which the router pays out to the caller.
 * - NFT positions: V4PositionManager collect calldata (decrease-by-zero +
 *   TAKE_PAIR to the owner).
 */
export async function maybeSpryLocalClaimFees(params: ClaimFeesRequest): Promise<ClaimFeesResponse | undefined> {
  const chainId = Number(params.chainId)
  if (!isSpryChain(chainId) || !params.walletAddress) {
    return undefined
  }

  const ref = parseSpryRawTokenId(params.tokenId)
  if (ref) {
    const pool = await fetchSpryPool(chainId, ref.poolId)
    const data = encodeModifyLiquidity({
      key: poolKeyFromRow(pool),
      tickLower: ref.tickLower,
      tickUpper: ref.tickUpper,
      liquidityDelta: BigInt(0),
      salt: saltForOwner(params.walletAddress),
    })
    return new ClaimFeesResponse({
      requestId: 'spry-local-claim',
      claim: buildTxRequest({ chainId, to: ref.router, from: params.walletAddress, data, value: BigInt(0) }),
    })
  }

  const nftTokenId = parseNftTokenId(params.tokenId)
  if (nftTokenId === undefined) {
    return undefined
  }
  const config = getSpryConfig(chainId)
  if (!config) {
    return undefined
  }
  const state = await fetchNftPositionState(chainId, nftTokenId)
  const [currency0, currency1] = await currenciesForPoolKey(chainId, state.key)
  const position = new V4Position({
    pool: v4PoolFromState({ currency0, currency1, key: state.key, sqrtPriceX96: state.sqrtPriceX96, tick: state.tick }),
    liquidity: state.liquidity.toString(),
    tickLower: state.tickLower,
    tickUpper: state.tickUpper,
  })
  const { calldata, value } = V4PositionManager.collectCallParameters(position, {
    tokenId: nftTokenId.toString(),
    recipient: params.walletAddress,
    slippageTolerance: new Percent(0), // collect moves no principal
    deadline: deadlineOrDefault(undefined),
  })
  return new ClaimFeesResponse({
    requestId: 'spry-local-claim',
    claim: buildTxRequest({
      chainId,
      to: config.addresses.positionManager,
      from: params.walletAddress,
      data: calldata as Hex,
      value: BigInt(value),
    }),
  })
}

/**
 * Decrease.
 * - raw positions: negative delta = live on-chain liquidity x the requested
 *   percentage, through the router.
 * - NFT positions: V4PositionManager remove calldata by tokenId.
 */
export async function maybeSpryLocalDecreasePosition(
  params: DecreasePositionRequest,
): Promise<DecreasePositionResponse | undefined> {
  const chainId = Number(params.chainId)
  if (!isSpryChain(chainId) || !params.walletAddress) {
    return undefined
  }

  const nftTokenId = parseNftTokenId(params.nftTokenId)
  if (nftTokenId !== undefined) {
    const config = getSpryConfig(chainId)
    if (!config) {
      return undefined
    }
    const state = await fetchNftPositionState(chainId, nftTokenId)
    if (state.liquidity === BigInt(0)) {
      throw new Error('Spry LP: nothing to remove (zero live liquidity for this position)')
    }
    const [currency0, currency1] = await currenciesForPoolKey(chainId, state.key)
    const position = new V4Position({
      pool: v4PoolFromState({
        currency0,
        currency1,
        key: state.key,
        sqrtPriceX96: state.sqrtPriceX96,
        tick: state.tick,
      }),
      liquidity: state.liquidity.toString(),
      tickLower: state.tickLower,
      tickUpper: state.tickUpper,
    })
    const percentBps = Math.min(10_000, Math.max(0, Math.round(params.liquidityPercentageToDecrease * 100)))
    const { calldata, value } = V4PositionManager.removeCallParameters(position, {
      tokenId: nftTokenId.toString(),
      liquidityPercentage: new Percent(percentBps, 10_000),
      slippageTolerance: percentFromSlippage(params.slippageTolerance),
      deadline: deadlineOrDefault(params.deadline),
      burnToken: false, // keep the NFT so the position stays visible as Closed
    })
    return new DecreasePositionResponse({
      requestId: 'spry-local-decrease',
      decrease: buildTxRequest({
        chainId,
        to: config.addresses.positionManager,
        from: params.walletAddress,
        data: calldata as Hex,
        value: BigInt(value),
      }),
    })
  }

  const ref = parseSpryRawTokenId(params.nftTokenId)
  if (!ref) {
    return undefined
  }
  const config = getSpryConfig(chainId)
  if (!config) {
    return undefined
  }
  const salt = saltForOwner(params.walletAddress)
  const [pool, positionInfo] = await Promise.all([
    fetchSpryPool(chainId, ref.poolId),
    getSpryPublicClient(chainId).readContract({
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
    decrease: buildTxRequest({ chainId, to: ref.router, from: params.walletAddress, data, value: BigInt(0) }),
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
  const independent = params.independentToken
  const chainId = Number(params.chainId)
  if (!isSpryChain(chainId) || !params.walletAddress || !independent) {
    return undefined
  }
  const config = getSpryConfig(chainId)
  const router = config?.addresses.poolModifyLiquidityTest
  if (!config || !router) {
    return undefined
  }

  // Resolve the target (pool key + range + live price) from either id form.
  // NFT increases also go through the ROUTER: the approval request carries no
  // tokenId so it cannot distinguish Permit2/posm from the router per position,
  // and a wallet-salted raw add at the same range is equivalent liquidity (it
  // shows up as a sibling raw position of the same pool).
  const ref = parseSpryRawTokenId(params.nftTokenId)
  const nftTokenId = ref ? undefined : parseNftTokenId(params.nftTokenId)
  let key: PoolKeyStruct
  let tickLower: number
  let tickUpper: number
  let sqrtPriceX96: bigint
  let tick: number
  let currency0: Currency
  let currency1: Currency
  if (ref) {
    const [pool, slot0] = await Promise.all([
      fetchSpryPool(chainId, ref.poolId),
      getSpryPublicClient(chainId).readContract({
        address: config.addresses.stateView,
        abi: STATE_VIEW_ABI,
        functionName: 'getSlot0',
        args: [ref.poolId],
      }),
    ])
    key = poolKeyFromRow(pool)
    tickLower = ref.tickLower
    tickUpper = ref.tickUpper
    sqrtPriceX96 = slot0[0]
    tick = slot0[1]
    currency0 = currencyForPoolToken(pool.token0, chainId)
    currency1 = currencyForPoolToken(pool.token1, chainId)
  } else if (nftTokenId !== undefined) {
    const state = await fetchNftPositionState(chainId, nftTokenId)
    key = state.key
    tickLower = state.tickLower
    tickUpper = state.tickUpper
    sqrtPriceX96 = state.sqrtPriceX96
    tick = state.tick
    ;[currency0, currency1] = await currenciesForPoolKey(chainId, state.key)
  } else {
    return undefined
  }

  const v4Pool = v4PoolFromState({ currency0, currency1, key, sqrtPriceX96, tick })

  const independentIsToken0 = isSameEvmAddress(independent.tokenAddress, key.currency0)
  const independentIsToken1 = isSameEvmAddress(independent.tokenAddress, key.currency1)
  if (!independentIsToken0 && !independentIsToken1) {
    throw new Error('Spry LP: independent token is not part of this pool')
  }
  const position = independentIsToken0
    ? V4Position.fromAmount0({
        pool: v4Pool,
        tickLower,
        tickUpper,
        amount0: independent.amount,
        useFullPrecision: true,
      })
    : V4Position.fromAmount1({
        pool: v4Pool,
        tickLower,
        tickUpper,
        amount1: independent.amount,
      })
  const liquidityDelta = BigInt(position.liquidity.toString())
  if (liquidityDelta <= BigInt(0)) {
    throw new Error('Spry LP: amount too small to add measurable liquidity')
  }
  const { amount0, amount1 } = position.mintAmounts // ceil: what the router will actually pull

  const data = encodeModifyLiquidity({
    key,
    tickLower,
    tickUpper,
    liquidityDelta,
    salt: saltForOwner(params.walletAddress),
  })
  const value = currency0.isNative ? BigInt(amount0.toString()) : BigInt(0)

  return new IncreasePositionResponse({
    requestId: 'spry-local-increase',
    token0: new LPToken({ tokenAddress: key.currency0, amount: amount0.toString() }),
    token1: new LPToken({ tokenAddress: key.currency1, amount: amount1.toString() }),
    increase: buildTxRequest({ chainId, to: ref?.router ?? router, from: params.walletAddress, data, value }),
  })
}

/**
 * Approval check for the LP write flows. Two spender models:
 *
 * - INCREASE (and any non-CREATE action): the PoolModifyLiquidityTest router
 *   pulls ERC20 legs via plain transferFrom, so each short leg gets one
 *   ERC20.approve(router) transaction. The approval request carries no
 *   tokenId; NFT increases are routed through the router too (see
 *   maybeSpryLocalIncreasePosition), so the router is always the spender.
 * - CREATE (new pool -> PositionManager mint): posm settles through Permit2,
 *   so each short leg gets up to two transactions: ERC20.approve(Permit2)
 *   (matched into the token0/token1Approval slots by `to` = token) and
 *   Permit2.approve(token, posm, max, far-expiration) (`to` = Permit2, which
 *   normalizeApprovalResponse classifies as a permit transaction; the LP saga
 *   executes those right before the create).
 *
 * Native legs never need approval (they ride as msg.value).
 */
export async function maybeSpryLocalLPApproval(params: LPApprovalRequest): Promise<LPApprovalResponse | undefined> {
  const chainId = Number(params.chainId)
  if (!isSpryChain(chainId) || !params.walletAddress) {
    return undefined
  }
  const config = getSpryConfig(chainId)
  const router = config?.addresses.poolModifyLiquidityTest
  if (!config || !router) {
    return undefined
  }
  const owner = params.walletAddress as Address
  const client = getSpryPublicClient(chainId)

  const erc20Legs = params.lpTokens.filter(
    (lpToken) =>
      lpToken.tokenAddress &&
      !isSameEvmAddress(lpToken.tokenAddress, ZERO_ADDRESS) &&
      BigInt(lpToken.amount || '0') > BigInt(0),
  )

  const transactions: ApprovalTransactionRequest[] = []
  const pushApproval = (tx: TransactionRequest): void => {
    transactions.push(new ApprovalTransactionRequest({ transaction: tx, cancelApproval: false, action: params.action }))
  }

  if (params.action === LPAction.CREATE) {
    const permit2 = getAddress(permit2Address(chainId))
    const posm = config.addresses.positionManager
    const reads = await Promise.all(
      erc20Legs.map(async (lpToken) => {
        const token = getAddress(lpToken.tokenAddress)
        return Promise.all([
          client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [owner, permit2],
          }),
          client.readContract({
            address: permit2,
            abi: PERMIT2_LP_ABI,
            functionName: 'allowance',
            args: [owner, token, posm],
          }),
        ])
      }),
    )
    const nowSeconds = Math.floor(Date.now() / 1000)
    erc20Legs.forEach((lpToken, i) => {
      const amount = BigInt(lpToken.amount)
      const [erc20Allowance, permit2Allowance] = reads[i] ?? [BigInt(0), [BigInt(0), 0, 0] as const]
      if (erc20Allowance < amount) {
        const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [permit2, maxUint256] })
        pushApproval(
          buildTxRequest({ chainId, to: lpToken.tokenAddress, from: params.walletAddress, data: approveData, value: BigInt(0) }),
        )
      }
      const [permitAmount, permitExpiration] = permit2Allowance
      if (BigInt(permitAmount) < amount || Number(permitExpiration) <= nowSeconds) {
        const permitData = encodeFunctionData({
          abi: PERMIT2_LP_ABI,
          functionName: 'approve',
          args: [getAddress(lpToken.tokenAddress), posm, maxUint160, Number(MAX_UINT48)],
        })
        pushApproval(
          buildTxRequest({ chainId, to: permit2, from: params.walletAddress, data: permitData, value: BigInt(0) }),
        )
      }
    })
    return new LPApprovalResponse({ requestId: 'spry-local-approval', transactions })
  }

  const allowances = await Promise.all(
    erc20Legs.map((lpToken) =>
      client.readContract({
        address: lpToken.tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, router],
      }),
    ),
  )

  erc20Legs.forEach((lpToken, i) => {
    const allowance = allowances[i] ?? BigInt(0)
    if (allowance >= BigInt(lpToken.amount)) {
      return
    }
    const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, maxUint256] })
    // normalizeApprovalResponse matches these to token0/token1 by `transaction.to`
    pushApproval(
      buildTxRequest({ chainId, to: lpToken.tokenAddress, from: params.walletAddress, data: approveData, value: BigInt(0) }),
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
  const chainId = Number(params.chainId)
  if (!isSpryChain(chainId) || !poolParams) {
    return undefined
  }
  const config = getSpryConfig(chainId)
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

  const client = getSpryPublicClient(chainId)
  const [slot0, poolLiquidity] = await Promise.all([
    client.readContract({
      address: config.addresses.stateView,
      abi: STATE_VIEW_ABI,
      functionName: 'getSlot0',
      args: [id],
    }),
    client.readContract({
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
        chainId,
        sqrtRatioX96: slot0[0].toString(),
        currentTick: slot0[1],
        poolLiquidity: poolLiquidity.toString(),
      }),
    ],
  })
}

/**
 * Build the NEW-pool create transaction: PositionManager.multicall(
 * initializePool(key, sqrtPriceX96), modifyLiquidities(mint)) via the v4 SDK's
 * addCallParameters({ createPool: true }) - pool initialization and the first
 * (full-range) position land in ONE transaction. ERC20 legs settle through
 * Permit2 (see the CREATE branch of maybeSpryLocalLPApproval); a native leg
 * rides as msg.value with a sweep for the excess.
 */
async function buildSpryNewPoolCreate(args: {
  chainId: number
  params: CreatePositionRequest
  newPool: CreatePoolParameters
}): Promise<CreatePositionResponse> {
  const { chainId, params, newPool } = args
  const config = getSpryConfig(chainId)
  const independent = params.independentToken
  if (!config || !independent) {
    throw new Error('Spry LP: malformed create request')
  }
  if (!newPool.hooks || !isSameEvmAddress(newPool.hooks, config.addresses.spryHook)) {
    throw new Error('Spry: only SpryHook pools can be created. Pick one of the Spry fee tiers.')
  }
  if (!newPool.tickSpacing || !newPool.initialPrice || newPool.initialPrice === '0') {
    throw new Error('Spry: set an initial price for the new pool first.')
  }

  // The form sends sorted (pool-order) token addresses and a sqrtPriceX96 in
  // that orientation; sort defensively anyway so the key is always canonical.
  const [sorted0, sorted1] = sortCurrencies(newPool.token0Address as Address, newPool.token1Address as Address)
  const key: PoolKeyStruct = {
    currency0: sorted0,
    currency1: sorted1,
    fee: newPool.fee,
    tickSpacing: newPool.tickSpacing,
    hooks: config.addresses.spryHook,
  }
  const [currency0, currency1] = await currenciesForPoolKey(chainId, key)

  // Guard: if someone initialized this pool since the form loaded, the
  // initializePool leg would revert the whole multicall - fail with a clear
  // next step instead.
  const id = computeSpryPoolId({
    currency0: key.currency0,
    currency1: key.currency1,
    fee: key.fee,
    tickSpacing: key.tickSpacing,
    hooks: key.hooks,
  })
  const existingSlot0 = await getSpryPublicClient(chainId).readContract({
    address: config.addresses.stateView,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: [id],
  })
  if (existingSlot0[0] !== BigInt(0)) {
    throw new Error('Spry: this pool was just initialized by someone else. Re-select the tier to add liquidity to it instead.')
  }

  const sqrtPriceX96 = newPool.initialPrice
  const tickAtPrice = TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96))
  const v4Pool = v4PoolFromState({ currency0, currency1, key, sqrtPriceX96, tick: tickAtPrice })

  // proto tick fields default to 0, so a degenerate (0,0) range also falls back to full range
  const requestTicks = params.tickPrice.case === 'tickBounds' ? params.tickPrice.value : undefined
  const { tickLower, tickUpper } =
    requestTicks && requestTicks.tickLower !== requestTicks.tickUpper
      ? { tickLower: requestTicks.tickLower, tickUpper: requestTicks.tickUpper }
      : fullRangeTicks(key.tickSpacing)

  const independentIsToken0 = isSameEvmAddress(independent.tokenAddress, key.currency0)
  const independentIsToken1 = isSameEvmAddress(independent.tokenAddress, key.currency1)
  if (!independentIsToken0 && !independentIsToken1) {
    throw new Error('Spry LP: independent token is not part of this pool')
  }
  const position = independentIsToken0
    ? V4Position.fromAmount0({ pool: v4Pool, tickLower, tickUpper, amount0: independent.amount, useFullPrecision: true })
    : V4Position.fromAmount1({ pool: v4Pool, tickLower, tickUpper, amount1: independent.amount })
  if (BigInt(position.liquidity.toString()) <= BigInt(0)) {
    throw new Error('Spry LP: amount too small to add measurable liquidity')
  }
  const { amount0, amount1 } = position.mintAmounts

  const { calldata, value } = V4PositionManager.addCallParameters(position, {
    recipient: params.walletAddress,
    slippageTolerance: percentFromSlippage(params.slippageTolerance),
    deadline: deadlineOrDefault(params.deadline),
    createPool: true,
    sqrtPriceX96,
    useNative: currency0.isNative ? nativeOnChain(chainId) : undefined,
  })

  return new CreatePositionResponse({
    requestId: 'spry-local-create',
    token0: new LPToken({ tokenAddress: key.currency0, amount: amount0.toString() }),
    token1: new LPToken({ tokenAddress: key.currency1, amount: amount1.toString() }),
    tickLower,
    tickUpper,
    create: buildTxRequest({
      chainId,
      to: config.addresses.positionManager,
      from: params.walletAddress,
      data: calldata as Hex,
      value: BigInt(value),
      // initialize (hook tier setup) + mint in one multicall needs more than a plain modify
      gasLimit: '1500000',
    }),
  })
}

/**
 * Create a position. Two cases:
 * - EXISTING Spry pool: same router modify as increase, addressed by the
 *   form's poolReference (set by maybeSpryLocalPoolInfo to the v4 poolId) and
 *   always full range for the pool's tick spacing. (The create page normally
 *   routes existing pools into the Add-liquidity modal before reaching this,
 *   but deep links can still land here.)
 * - NEW pool: one PositionManager multicall that initializes the pool at the
 *   user's initial price and mints the first full-range position.
 */
export async function maybeSpryLocalCreatePosition(
  params: CreatePositionRequest,
): Promise<CreatePositionResponse | undefined> {
  const independent = params.independentToken
  const chainId = Number(params.chainId)
  if (!isSpryChain(chainId) || !params.walletAddress || !independent) {
    return undefined
  }
  const config = getSpryConfig(chainId)
  const router = config?.addresses.poolModifyLiquidityTest
  if (!config || !router) {
    return undefined
  }
  if (params.pool.case === 'newPool') {
    return buildSpryNewPoolCreate({ chainId, params, newPool: params.pool.value })
  }
  if (params.pool.case !== 'existingPool' || !params.pool.value.poolReference.startsWith('0x')) {
    return undefined
  }
  const poolIdRef = params.pool.value.poolReference as Hex

  const pool = await fetchSpryPool(chainId, poolIdRef)
  const slot0 = await getSpryPublicClient(chainId).readContract({
    address: config.addresses.stateView,
    abi: STATE_VIEW_ABI,
    functionName: 'getSlot0',
    args: [poolIdRef],
  })

  const currency0 = currencyForPoolToken(pool.token0, chainId)
  const currency1 = currencyForPoolToken(pool.token1, chainId)
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
    create: buildTxRequest({ chainId, to: router, from: params.walletAddress, data, value }),
  })
}
