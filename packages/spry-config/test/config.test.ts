import { describe, it, expect } from 'vitest';
import { DYNAMIC_FEE_FLAG } from '@spry/fee';
import {
  ChainId,
  PERMIT2_ADDRESS,
  PLACEHOLDER_ADDRESS,
  SUPPORTED_CHAIN_IDS,
  getSpryConfig,
  requireSpryConfig,
  isSupportedChain,
  isSpryDeployed,
  isSpryPoolKey,
  classifySpryPoolKey,
  assertSpryPoolKey,
} from '../src/index';

describe('chain configs', () => {
  it('supports the three subgraph networks', () => {
    expect(SUPPORTED_CHAIN_IDS.sort()).toEqual(
      [ChainId.SEPOLIA, ChainId.BASE_SEPOLIA, ChainId.UNICHAIN_SEPOLIA].sort(),
    );
  });

  it('exposes real V4 addresses and universal Permit2', () => {
    const base = requireSpryConfig(ChainId.BASE_SEPOLIA);
    expect(base.addresses.poolManager).toBe('0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408');
    expect(base.addresses.permit2).toBe(PERMIT2_ADDRESS);
  });

  it('marks Spry contracts as not-yet-deployed (placeholders)', () => {
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      const config = requireSpryConfig(chainId);
      expect(config.addresses.spryHook).toBe(PLACEHOLDER_ADDRESS);
      expect(config.addresses.spryRouter).toBe(PLACEHOLDER_ADDRESS);
      expect(isSpryDeployed(config)).toBe(false);
      expect(config.subgraphUrl).toBeNull();
    }
  });

  it('looks up configs and rejects unsupported chains', () => {
    expect(getSpryConfig(ChainId.SEPOLIA)?.key).toBe('sepolia');
    expect(getSpryConfig(1)).toBeUndefined();
    expect(isSupportedChain(1)).toBe(false);
    expect(() => requireSpryConfig(1)).toThrow();
  });
});

describe('Spry-pool predicate', () => {
  const config = requireSpryConfig(ChainId.BASE_SEPOLIA);
  // Pre-deployment, the configured hook IS the placeholder, so a key pointing
  // at it with the dynamic-fee flag and a valid tick spacing is "Spry".
  const validKey = { hooks: PLACEHOLDER_ADDRESS, fee: DYNAMIC_FEE_FLAG, tickSpacing: 60 };

  it('accepts a well-formed key (case-insensitive hook match)', () => {
    expect(isSpryPoolKey(validKey, config)).toBe(true);
    expect(isSpryPoolKey({ ...validKey, hooks: PLACEHOLDER_ADDRESS.toLowerCase() }, config)).toBe(true);
    expect(classifySpryPoolKey(validKey, config)).toBeNull();
  });

  it('rejects the wrong hook', () => {
    const key = { ...validKey, hooks: '0x0000000000000000000000000000000000000001' };
    expect(isSpryPoolKey(key, config)).toBe(false);
    expect(classifySpryPoolKey(key, config)).toBe('wrong-hook');
  });

  it('rejects a static (non-dynamic) fee', () => {
    const key = { ...validKey, fee: 3000 };
    expect(classifySpryPoolKey(key, config)).toBe('not-dynamic-fee');
  });

  it('rejects an invalid tick spacing', () => {
    const key = { ...validKey, tickSpacing: 61 };
    expect(classifySpryPoolKey(key, config)).toBe('invalid-tick-spacing');
    expect(() => assertSpryPoolKey(key, config)).toThrow();
  });
});
