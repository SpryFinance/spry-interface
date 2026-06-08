import { describe, it, expect } from 'vitest';
import { decodeFunctionData, getAddress } from 'viem';
import {
  spryRouterAbi,
  NATIVE_CURRENCY,
  buildSwapExactInputSingle,
  buildSwapExactInputSingleViaPermit2,
  buildSwapExactOutputSingle,
  buildSwapExactInput,
  buildSwapExactOutput,
  encodePermit,
  encodePermitBatch,
  buildPermit2AndSwap,
  isNativeCurrency,
  assertUint256,
  assertPathAdjacency,
  assertPathAdjacencyExactOut,
  type PoolKey,
  type PathKey,
  type PermitSingle,
  type PermitBatch,
} from '../src/index';

const ROUTER = getAddress('0x1111111111111111111111111111111111111111');
const OWNER = getAddress('0x9999999999999999999999999999999999999999');
const TOKEN_A = getAddress('0x2222222222222222222222222222222222222222');
const TOKEN_B = getAddress('0x3333333333333333333333333333333333333333');
const TOKEN_C = getAddress('0x6666666666666666666666666666666666666666');
const RECIPIENT = getAddress('0x4444444444444444444444444444444444444444');
const HOOK = getAddress('0x5555555555555555555555555555555555555555');
const DEADLINE = 1_900_000_000n;
const SIG = `0x${'ab'.repeat(65)}` as const;

const KEY: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK };
const PATH: PathKey[] = [{ intermediateCurrency: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' }];

function decoded(data: `0x${string}`) {
  return decodeFunctionData({ abi: spryRouterAbi, data });
}

// The selector test elsewhere proves the right FUNCTION; these prove the right
// ARGUMENT ORDER for each distinct signature shape (an order bug would lose funds).
describe('argument round-trips per signature shape', () => {
  it('exact-out single (amountOut before amountInMax)', () => {
    const req = buildSwapExactOutputSingle({
      router: ROUTER, key: KEY, zeroForOne: false,
      amountOut: 500n, amountInMax: 600n, recipient: RECIPIENT, deadline: DEADLINE,
    });
    expect(decoded(req.data).args).toEqual([KEY, false, 500n, 600n, RECIPIENT, DEADLINE, '0x']);
  });

  it('exact-in multi-hop', () => {
    const req = buildSwapExactInput({
      router: ROUTER, currencyIn: TOKEN_A, path: PATH,
      amountIn: 1_000n, amountOutMin: 900n, recipient: RECIPIENT, deadline: DEADLINE,
    });
    expect(decoded(req.data).args).toEqual([TOKEN_A, PATH, 1_000n, 900n, RECIPIENT, DEADLINE]);
  });

  it('exact-out multi-hop', () => {
    const req = buildSwapExactOutput({
      router: ROUTER, currencyOut: TOKEN_A, path: PATH,
      amountOut: 500n, amountInMax: 600n, recipient: RECIPIENT, deadline: DEADLINE,
    });
    expect(decoded(req.data).args).toEqual([TOKEN_A, PATH, 500n, 600n, RECIPIENT, DEADLINE]);
  });

  it('Permit2 variant shares the same arg order', () => {
    const req = buildSwapExactInputSingleViaPermit2({
      router: ROUTER, key: KEY, zeroForOne: true,
      amountIn: 1_000n, amountOutMin: 900n, recipient: RECIPIENT, deadline: DEADLINE,
    });
    expect(decoded(req.data).args).toEqual([KEY, true, 1_000n, 900n, RECIPIENT, DEADLINE, '0x']);
  });

  it('passes hookData through', () => {
    const req = buildSwapExactInputSingle({
      router: ROUTER, key: KEY, zeroForOne: true,
      amountIn: 1n, amountOutMin: 1n, recipient: RECIPIENT, deadline: DEADLINE, hookData: '0xdeadbeef',
    });
    expect(decoded(req.data).args).toEqual([KEY, true, 1n, 1n, RECIPIENT, DEADLINE, '0xdeadbeef']);
  });
});

describe('exact-out multi-hop native value', () => {
  const base = {
    router: ROUTER, currencyOut: TOKEN_A, path: PATH,
    amountOut: 500n, amountInMax: 600n, recipient: RECIPIENT, deadline: DEADLINE,
  };
  it('attaches amountInMax only when inputIsNative is set', () => {
    expect(buildSwapExactOutput({ ...base, inputIsNative: true }).value).toBe(600n);
    expect(buildSwapExactOutput({ ...base, inputIsNative: false }).value).toBe(0n);
    expect(buildSwapExactOutput(base).value).toBe(0n);
  });
});

describe('Permit2 encoders', () => {
  const permitSingle: PermitSingle = {
    details: { token: TOKEN_A, amount: 1_000n, expiration: 123, nonce: 4 },
    spender: ROUTER,
    sigDeadline: DEADLINE,
  };

  it('encodePermit round-trips the PermitSingle struct', () => {
    const d = decoded(encodePermit(OWNER, permitSingle, SIG));
    expect(d.functionName).toBe('permit');
    expect(d.args).toEqual([OWNER, permitSingle, SIG]);
  });

  it('encodePermitBatch round-trips the PermitBatch struct', () => {
    const permitBatch: PermitBatch = {
      details: [
        { token: TOKEN_A, amount: 1_000n, expiration: 123, nonce: 4 },
        { token: TOKEN_B, amount: 2_000n, expiration: 5, nonce: 6 },
      ],
      spender: ROUTER,
      sigDeadline: DEADLINE,
    };
    const d = decoded(encodePermitBatch(OWNER, permitBatch, SIG));
    expect(d.functionName).toBe('permitBatch');
    expect(d.args).toEqual([OWNER, permitBatch, SIG]);
  });

  it('buildPermit2AndSwap batches permit + swap into one multicall', () => {
    const swap = buildSwapExactInputSingleViaPermit2({
      router: ROUTER, key: KEY, zeroForOne: true,
      amountIn: 1_000n, amountOutMin: 1n, recipient: RECIPIENT, deadline: DEADLINE,
    });
    const batch = buildPermit2AndSwap(ROUTER, OWNER, permitSingle, SIG, swap);
    expect(batch.value).toBe(0n);
    const d = decoded(batch.data);
    expect(d.functionName).toBe('multicall');
    expect(d.args).toEqual([[encodePermit(OWNER, permitSingle, SIG), swap.data]]);
  });
});

describe('guards (direct)', () => {
  it('isNativeCurrency', () => {
    expect(isNativeCurrency(NATIVE_CURRENCY)).toBe(true);
    expect(isNativeCurrency(TOKEN_A)).toBe(false);
  });

  it('assertUint256 allows zero and rejects out-of-range', () => {
    expect(assertUint256(0n, 'x')).toBeUndefined();
    expect(() => assertUint256(-1n, 'x')).toThrow();
    expect(() => assertUint256(2n ** 256n, 'x')).toThrow();
  });

  it('amountOutMin of zero is allowed', () => {
    expect(() =>
      buildSwapExactInputSingle({
        router: ROUTER, key: KEY, zeroForOne: true,
        amountIn: 1n, amountOutMin: 0n, recipient: RECIPIENT, deadline: DEADLINE,
      }),
    ).not.toThrow();
  });

  it('assertPathAdjacency passes a valid 2-hop and rejects a mid-path self-hop', () => {
    const twoHop: PathKey[] = [
      { intermediateCurrency: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
      { intermediateCurrency: TOKEN_C, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
    ];
    expect(() => assertPathAdjacency(TOKEN_A, twoHop)).not.toThrow();

    const badMid: PathKey[] = [
      { intermediateCurrency: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
      { intermediateCurrency: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
    ];
    expect(() => assertPathAdjacency(TOKEN_A, badMid)).toThrow(/self-hop/);
  });

  it('assertPathAdjacencyExactOut validates the forward chain including the final hop vs currencyOut', () => {
    // Valid exact-output chain TOKEN_A -> TOKEN_B -> TOKEN_C (path is the input side).
    const okPath: PathKey[] = [
      { intermediateCurrency: TOKEN_A, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
      { intermediateCurrency: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
    ];
    expect(() => assertPathAdjacencyExactOut(TOKEN_C, okPath)).not.toThrow();

    // Degenerate FINAL hop (path[n-1] === currencyOut) - the case the exact-input guard misses.
    const badFinal: PathKey[] = [
      { intermediateCurrency: TOKEN_A, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
      { intermediateCurrency: TOKEN_C, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
    ];
    expect(() => assertPathAdjacencyExactOut(TOKEN_C, badFinal)).toThrow(/self-hop/);

    // Mid-path self-hop is still caught.
    const badMid: PathKey[] = [
      { intermediateCurrency: TOKEN_A, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
      { intermediateCurrency: TOKEN_A, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' },
    ];
    expect(() => assertPathAdjacencyExactOut(TOKEN_C, badMid)).toThrow(/self-hop/);
  });
});
