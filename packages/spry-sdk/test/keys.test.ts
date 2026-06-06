import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import { PoolTier } from '@spry/fee';
import { DYNAMIC_FEE_FLAG } from '@spry/fee';
import { poolId, sortCurrencies, spryPoolKey, NATIVE_CURRENCY, type PoolKey } from '../src/index';

const A = getAddress('0x2222222222222222222222222222222222222222');
const B = getAddress('0x3333333333333333333333333333333333333333');
const HOOK = getAddress('0x5555555555555555555555555555555555555555');
const KEY: PoolKey = { currency0: A, currency1: B, fee: DYNAMIC_FEE_FLAG, tickSpacing: 60, hooks: HOOK };

describe('poolId', () => {
  it('is a 32-byte hex hash and deterministic', () => {
    const id = poolId(KEY);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(poolId(KEY)).toBe(id);
    expect(poolId({ ...KEY })).toBe(id);
  });

  it('changes when any field changes', () => {
    const id = poolId(KEY);
    expect(poolId({ ...KEY, tickSpacing: 1 })).not.toBe(id);
    expect(poolId({ ...KEY, fee: 3000 })).not.toBe(id);
    expect(poolId({ ...KEY, hooks: A })).not.toBe(id);
    expect(poolId({ ...KEY, currency1: HOOK })).not.toBe(id);
  });
});

describe('sortCurrencies', () => {
  it('orders by numeric value with native first', () => {
    expect(sortCurrencies(B, A)).toEqual([A, B]);
    expect(sortCurrencies(A, B)).toEqual([A, B]);
    expect(sortCurrencies(A, NATIVE_CURRENCY)).toEqual([NATIVE_CURRENCY, A]);
  });
});

describe('spryPoolKey', () => {
  it('builds a dynamic-fee key with the tier tick spacing and sorted currencies', () => {
    const key = spryPoolKey({ tokenA: B, tokenB: A, tier: PoolTier.BLUE_CHIP, hookAddress: HOOK });
    expect(key.fee).toBe(DYNAMIC_FEE_FLAG);
    expect(key.tickSpacing).toBe(60); // BLUE_CHIP
    expect(key.hooks).toBe(HOOK);
    expect([key.currency0, key.currency1]).toEqual([A, B]); // sorted
  });
});
