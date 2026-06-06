import { describe, it, expect } from 'vitest';
import { DYNAMIC_FEE_FLAG } from '@spry/fee';
import {
  ChainId,
  DEFAULT_CHAIN_ID,
  SUPPORTED_CHAIN_IDS,
  PLACEHOLDER_ADDRESS,
  ZERO_ADDRESS,
  requireSpryConfig,
  isSupportedChain,
  isSpryDeployed,
  assertSpryDeployed,
  sameAddress,
  isPlaceholder,
  classifySpryPoolKey,
} from '../src/index';

describe('address helpers', () => {
  it('compares addresses case-insensitively', () => {
    expect(sameAddress('0xAbCd', '0xabcd')).toBe(true);
    expect(sameAddress('0xAbCd', '0x0000')).toBe(false);
    expect(sameAddress(undefined, '0xabcd')).toBe(false);
    expect(sameAddress(null, null)).toBe(false);
  });

  it('detects placeholders', () => {
    expect(isPlaceholder(PLACEHOLDER_ADDRESS)).toBe(true);
    expect(isPlaceholder(ZERO_ADDRESS)).toBe(true);
    expect(isPlaceholder(requireSpryConfig(ChainId.BASE_SEPOLIA).addresses.poolManager)).toBe(false);
  });
});

describe('deployment gating', () => {
  it('base-sepolia is deployed; placeholder chains are not', () => {
    const base = requireSpryConfig(ChainId.BASE_SEPOLIA);
    expect(isSpryDeployed(base)).toBe(true);
    expect(() => assertSpryDeployed(base)).not.toThrow();

    const sepolia = requireSpryConfig(ChainId.SEPOLIA);
    expect(isSpryDeployed(sepolia)).toBe(false);
    expect(() => assertSpryDeployed(sepolia)).toThrow();
  });
});

describe('config invariants', () => {
  it('has a supported default chain', () => {
    expect(DEFAULT_CHAIN_ID).toBe(ChainId.BASE_SEPOLIA);
    expect(isSupportedChain(DEFAULT_CHAIN_ID)).toBe(true);
  });

  it('every chain has a slug, numeric block-window hint, and Permit2', () => {
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      const config = requireSpryConfig(chainId);
      expect(config.key).toMatch(/^[a-z-]+$/);
      expect(typeof config.blockWindowHint).toBe('number');
      expect(config.addresses.permit2).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});

describe('predicate rejection precedence', () => {
  it('reports the wrong hook before checking the fee', () => {
    const config = requireSpryConfig(ChainId.BASE_SEPOLIA);
    // Wrong hook AND a static fee: hook is checked first.
    const key = { hooks: ZERO_ADDRESS, fee: 3000, tickSpacing: 61 };
    expect(classifySpryPoolKey(key, config)).toBe('wrong-hook');
    // Right hook, static fee, bad spacing: fee is checked before spacing.
    const key2 = { hooks: config.addresses.spryHook, fee: 3000, tickSpacing: 61 };
    expect(classifySpryPoolKey(key2, config)).toBe('not-dynamic-fee');
    // Right hook, dynamic fee, bad spacing.
    const key3 = { hooks: config.addresses.spryHook, fee: DYNAMIC_FEE_FLAG, tickSpacing: 61 };
    expect(classifySpryPoolKey(key3, config)).toBe('invalid-tick-spacing');
  });
});
