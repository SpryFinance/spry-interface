import { describe, it, expect } from 'vitest';
import { decodeFunctionData, getAddress } from 'viem';
import {
  spryRouterAbi,
  NATIVE_CURRENCY,
  buildSwapExactInputSingle,
  buildSwapExactInputSingleViaPermit2,
  buildSwapExactOutputSingle,
  buildSwapExactOutputSingleViaPermit2,
  buildSwapExactInput,
  buildSwapExactInputViaPermit2,
  buildSwapExactOutput,
  buildSwapExactOutputViaPermit2,
  buildMulticall,
  buildSelfPermitAndSwap,
  encodeSelfPermit,
  type PoolKey,
  type PathKey,
} from '../src/index';

const ROUTER = getAddress('0x1111111111111111111111111111111111111111');
const TOKEN_A = getAddress('0x2222222222222222222222222222222222222222');
const TOKEN_B = getAddress('0x3333333333333333333333333333333333333333');
const RECIPIENT = getAddress('0x4444444444444444444444444444444444444444');
const HOOK = getAddress('0x5555555555555555555555555555555555555555');
const DEADLINE = 1_900_000_000n;

const KEY: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK };
const NATIVE_KEY: PoolKey = { currency0: NATIVE_CURRENCY, currency1: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK };
const PATH: PathKey[] = [
  { intermediateCurrency: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
];

function decoded(data: `0x${string}`) {
  return decodeFunctionData({ abi: spryRouterAbi, data });
}

describe('exact-in single calldata', () => {
  it('encodes the right function and round-trips args', () => {
    const req = buildSwapExactInputSingle({
      router: ROUTER,
      key: KEY,
      zeroForOne: true,
      amountIn: 1_000n,
      amountOutMin: 900n,
      recipient: RECIPIENT,
      deadline: DEADLINE,
    });
    expect(req.to).toBe(ROUTER);
    expect(req.value).toBe(0n); // ERC-20 input
    const d = decoded(req.data);
    expect(d.functionName).toBe('swapExactInputSingle');
    expect(d.args).toEqual([KEY, true, 1_000n, 900n, RECIPIENT, DEADLINE, '0x']);
  });

  it('attaches native value when the input currency is native', () => {
    const req = buildSwapExactInputSingle({
      router: ROUTER,
      key: NATIVE_KEY,
      zeroForOne: true, // currency0 (native) is the input
      amountIn: 5_000n,
      amountOutMin: 1n,
      recipient: RECIPIENT,
      deadline: DEADLINE,
    });
    expect(req.value).toBe(5_000n);
  });
});

describe('function selectors for every builder', () => {
  const base = { router: ROUTER, recipient: RECIPIENT, deadline: DEADLINE };
  const single = { ...base, key: KEY, zeroForOne: true };
  const multi = { ...base, path: PATH };

  it('maps each builder to its router function', () => {
    expect(decoded(buildSwapExactInputSingle({ ...single, amountIn: 1n, amountOutMin: 1n }).data).functionName).toBe(
      'swapExactInputSingle',
    );
    expect(
      decoded(buildSwapExactInputSingleViaPermit2({ ...single, amountIn: 1n, amountOutMin: 1n }).data).functionName,
    ).toBe('swapExactInputSingleViaPermit2');
    expect(decoded(buildSwapExactOutputSingle({ ...single, amountOut: 1n, amountInMax: 1n }).data).functionName).toBe(
      'swapExactOutputSingle',
    );
    expect(
      decoded(buildSwapExactOutputSingleViaPermit2({ ...single, amountOut: 1n, amountInMax: 1n }).data).functionName,
    ).toBe('swapExactOutputSingleViaPermit2');
    expect(
      decoded(buildSwapExactInput({ ...multi, currencyIn: TOKEN_A, amountIn: 1n, amountOutMin: 1n }).data).functionName,
    ).toBe('swapExactInput');
    expect(
      decoded(buildSwapExactInputViaPermit2({ ...multi, currencyIn: TOKEN_A, amountIn: 1n, amountOutMin: 1n }).data)
        .functionName,
    ).toBe('swapExactInputViaPermit2');
    expect(
      decoded(buildSwapExactOutput({ ...multi, currencyOut: TOKEN_A, amountOut: 1n, amountInMax: 1n }).data)
        .functionName,
    ).toBe('swapExactOutput');
    expect(
      decoded(buildSwapExactOutputViaPermit2({ ...multi, currencyOut: TOKEN_A, amountOut: 1n, amountInMax: 1n }).data)
        .functionName,
    ).toBe('swapExactOutputViaPermit2');
  });
});

describe('value computation', () => {
  const base = { router: ROUTER, recipient: RECIPIENT, deadline: DEADLINE };

  it('exact-out single native input uses amountInMax as value', () => {
    const req = buildSwapExactOutputSingle({
      ...base,
      key: NATIVE_KEY,
      zeroForOne: true,
      amountOut: 100n,
      amountInMax: 7_000n,
    });
    expect(req.value).toBe(7_000n);
  });

  it('Permit2 variants never attach native value and reject native input', () => {
    const req = buildSwapExactInputSingleViaPermit2({
      ...base,
      key: KEY,
      zeroForOne: true,
      amountIn: 1_000n,
      amountOutMin: 1n,
    });
    expect(req.value).toBe(0n);
    expect(() =>
      buildSwapExactInputSingleViaPermit2({
        ...base,
        key: NATIVE_KEY,
        zeroForOne: true,
        amountIn: 1_000n,
        amountOutMin: 1n,
      }),
    ).toThrow(/ERC-20/);
  });

  it('multi-hop exact-in attaches native value for a native currencyIn', () => {
    const req = buildSwapExactInput({
      ...base,
      currencyIn: NATIVE_CURRENCY,
      path: PATH,
      amountIn: 2_000n,
      amountOutMin: 1n,
    });
    expect(req.value).toBe(2_000n);
  });
});

describe('section 6.1 guards', () => {
  const base = { router: ROUTER, key: KEY, zeroForOne: true, recipient: RECIPIENT, deadline: DEADLINE };

  it('rejects recipient == router (no sweep)', () => {
    expect(() =>
      buildSwapExactInputSingle({ ...base, recipient: ROUTER, amountIn: 1n, amountOutMin: 1n }),
    ).toThrow(/SpryRouter/);
  });

  it('rejects amounts outside [1, 2^255)', () => {
    expect(() => buildSwapExactInputSingle({ ...base, amountIn: 0n, amountOutMin: 1n })).toThrow();
    expect(() => buildSwapExactInputSingle({ ...base, amountIn: 2n ** 255n, amountOutMin: 1n })).toThrow();
  });

  it('rejects a non-positive deadline', () => {
    expect(() => buildSwapExactInputSingle({ ...base, amountIn: 1n, amountOutMin: 1n, deadline: 0n })).toThrow();
  });

  it('rejects an empty path and self-hops', () => {
    expect(() =>
      buildSwapExactInput({ router: ROUTER, currencyIn: TOKEN_A, path: [], amountIn: 1n, amountOutMin: 1n, recipient: RECIPIENT, deadline: DEADLINE }),
    ).toThrow(/at least one hop/);
    const selfHop: PathKey[] = [{ intermediateCurrency: TOKEN_A, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' }];
    expect(() =>
      buildSwapExactInput({ router: ROUTER, currencyIn: TOKEN_A, path: selfHop, amountIn: 1n, amountOutMin: 1n, recipient: RECIPIENT, deadline: DEADLINE }),
    ).toThrow(/self-hop/);
  });
});

describe('multicall batching', () => {
  it('wraps calls in multicall preserving value', () => {
    const swap = buildSwapExactInputSingle({
      router: ROUTER,
      key: NATIVE_KEY,
      zeroForOne: true,
      amountIn: 5_000n,
      amountOutMin: 1n,
      recipient: RECIPIENT,
      deadline: DEADLINE,
    });
    const batch = buildMulticall(ROUTER, [swap.data], swap.value);
    expect(batch.value).toBe(5_000n);
    const d = decoded(batch.data);
    expect(d.functionName).toBe('multicall');
    expect(d.args).toEqual([[swap.data]]);
  });

  it('buildSelfPermitAndSwap batches a permit ahead of the swap', () => {
    const swap = buildSwapExactInputSingle({
      router: ROUTER,
      key: KEY,
      zeroForOne: true,
      amountIn: 1_000n,
      amountOutMin: 1n,
      recipient: RECIPIENT,
      deadline: DEADLINE,
    });
    const permit = encodeSelfPermit({
      token: TOKEN_A,
      value: 1_000n,
      deadline: DEADLINE,
      v: 27,
      r: `0x${'11'.repeat(32)}`,
      s: `0x${'22'.repeat(32)}`,
    });
    const batch = buildSelfPermitAndSwap(ROUTER, {
      token: TOKEN_A,
      value: 1_000n,
      deadline: DEADLINE,
      v: 27,
      r: `0x${'11'.repeat(32)}`,
      s: `0x${'22'.repeat(32)}`,
    }, swap);
    const d = decoded(batch.data);
    expect(d.functionName).toBe('multicall');
    expect(d.args).toEqual([[permit, swap.data]]);
  });
});
