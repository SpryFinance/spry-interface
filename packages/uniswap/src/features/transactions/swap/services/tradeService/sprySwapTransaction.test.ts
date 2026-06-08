import { PoolTier } from '@spry/fee'
import { poolId, spryPoolKey, spryRouterAbi, type Address } from '@spry/sdk'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import type { SpryHop } from 'uniswap/src/features/transactions/swap/services/tradeService/spryRouting'
import { buildSprySwapTxRequest } from 'uniswap/src/features/transactions/swap/services/tradeService/sprySwapTransaction'
import { decodeFunctionData } from 'viem'

// The deployed Spry pool tokens + SpryRouter + SpryHook on Base Sepolia (checksummed).
const SPT_A: Address = '0xb56d680aea10bb81414851c44f46c8e315932342'
const SPT_B: Address = '0xbebc724ee71f74cadfd927ed235e4dc71ff28c8b'
const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'
const SPRY_ROUTER = '0xd4Af9FFDf2067d4CA422526D308E08CDBE690642'
const SPRY_HOOK: Address = '0x43C99D40E2E7FBa44435bFC6Da57a74d38fD0080'
// es2019 target forbids BigInt literal syntax (0n); use BigInt(...) throughout.
const ONE_E18 = BigInt(10) ** BigInt(18)
const DEADLINE = BigInt(1893456000)

/** A single-hop sptA<->sptB route in the given direction (the pool used pre-multi-hop). */
function sptABRoute(tokenIn: Address, tokenOut: Address): SpryHop[] {
  const poolKey = spryPoolKey({ tokenA: SPT_A, tokenB: SPT_B, tier: PoolTier.BLUE_CHIP, hookAddress: SPRY_HOOK })
  return [
    {
      poolKey,
      poolId: poolId(poolKey),
      zeroForOne: BigInt(tokenIn) === BigInt(poolKey.currency0),
      currencyIn: tokenIn,
      currencyOut: tokenOut,
    },
  ]
}

describe('buildSprySwapTxRequest', () => {
  it('returns null for non-Base-Sepolia chains', () => {
    const tx = buildSprySwapTxRequest({
      chainId: UniverseChainId.Mainnet,
      route: sptABRoute(SPT_A, SPT_B),
      exactInput: true,
      amountIn: BigInt(1),
      amountOut: BigInt(0),
      amountOutMin: BigInt(0),
      amountInMax: BigInt(0),
      recipient: ACCOUNT,
      deadline: DEADLINE,
    })
    expect(tx).toBeNull()
  })

  it('encodes swapExactInputSingle for sptA->sptB with zeroForOne=true', () => {
    const tx = buildSprySwapTxRequest({
      chainId: UniverseChainId.BaseSepolia,
      route: sptABRoute(SPT_A, SPT_B),
      exactInput: true,
      amountIn: ONE_E18,
      amountOut: BigInt(0),
      amountOutMin: BigInt(900),
      amountInMax: BigInt(0),
      recipient: ACCOUNT,
      deadline: DEADLINE,
    })
    expect(tx).not.toBeNull()
    expect(tx?.to).toBe(SPRY_ROUTER)
    expect(tx?.value).toBe(BigInt(0)) // ERC20 input, no native value
    expect(tx?.chainId).toBe(UniverseChainId.BaseSepolia)

    const decoded = decodeFunctionData({ abi: spryRouterAbi, data: tx?.data ?? '0x' })
    expect(decoded.functionName).toBe('swapExactInputSingle')
    const args = decoded.args as readonly unknown[]
    // sptA (0xb5..) sorts before sptB (0xbe..), so currency0 = sptA and input is currency0.
    expect(args[1]).toBe(true) // zeroForOne
    expect(args[2]).toBe(ONE_E18) // amountIn
    expect(args[3]).toBe(BigInt(900)) // amountOutMin
    expect(args[5]).toBe(DEADLINE) // deadline
  })

  it('encodes swapExactOutputSingle for sptB->sptA with zeroForOne=false', () => {
    const tx = buildSprySwapTxRequest({
      chainId: UniverseChainId.BaseSepolia,
      route: sptABRoute(SPT_B, SPT_A),
      exactInput: false,
      amountIn: BigInt(0),
      amountOut: ONE_E18,
      amountOutMin: BigInt(0),
      amountInMax: BigInt(5000),
      recipient: ACCOUNT,
      deadline: DEADLINE,
    })
    expect(tx).not.toBeNull()
    expect(tx?.value).toBe(BigInt(0))

    const decoded = decodeFunctionData({ abi: spryRouterAbi, data: tx?.data ?? '0x' })
    expect(decoded.functionName).toBe('swapExactOutputSingle')
    const args = decoded.args as readonly unknown[]
    // input is sptB (currency1), so zeroForOne = false.
    expect(args[1]).toBe(false) // zeroForOne
    expect(args[2]).toBe(ONE_E18) // amountOut
    expect(args[3]).toBe(BigInt(5000)) // amountInMax
  })

  it('throws if the recipient is the zero address (never send funds to the void)', () => {
    expect(() =>
      buildSprySwapTxRequest({
        chainId: UniverseChainId.BaseSepolia,
        route: sptABRoute(SPT_A, SPT_B),
        exactInput: true,
        amountIn: ONE_E18,
        amountOut: BigInt(0),
        amountOutMin: BigInt(900),
        amountInMax: BigInt(0),
        recipient: ZERO_ADDRESS,
        deadline: DEADLINE,
      }),
    ).toThrow(/recipient/)
  })

  it('throws on a zero amountOutMin (no slippage protection) for exact-input', () => {
    expect(() =>
      buildSprySwapTxRequest({
        chainId: UniverseChainId.BaseSepolia,
        route: sptABRoute(SPT_A, SPT_B),
        exactInput: true,
        amountIn: ONE_E18,
        amountOut: BigInt(0),
        amountOutMin: BigInt(0),
        amountInMax: BigInt(0),
        recipient: ACCOUNT,
        deadline: DEADLINE,
      }),
    ).toThrow(/amountOutMin/)
  })

  it('throws on a zero amountInMax for exact-output', () => {
    expect(() =>
      buildSprySwapTxRequest({
        chainId: UniverseChainId.BaseSepolia,
        route: sptABRoute(SPT_B, SPT_A),
        exactInput: false,
        amountIn: BigInt(0),
        amountOut: ONE_E18,
        amountOutMin: BigInt(0),
        amountInMax: BigInt(0),
        recipient: ACCOUNT,
        deadline: DEADLINE,
      }),
    ).toThrow(/amountInMax/)
  })
})
