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

  it('exposes the real canonical V4 + Spry addresses on Base Sepolia', () => {
    const base = requireSpryConfig(ChainId.BASE_SEPOLIA);
    expect(base.addresses.poolManager).toBe('0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408');
    expect(base.addresses.permit2).toBe(PERMIT2_ADDRESS);
    expect(base.addresses.quoter).toBe('0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa');
    expect(base.addresses.stateView).toBe('0x571291b572ed32ce6751a2Cb2486EbEe8DEfB9B4');
    expect(base.startBlock).toBe(42508548);
  });

  it('reflects deployment status per chain', () => {
    const base = requireSpryConfig(ChainId.BASE_SEPOLIA);
    expect(base.addresses.spryHook).toBe('0x43C99D40E2E7FBa44435bFC6Da57a74d38fD0080');
    expect(base.addresses.spryRouter).toBe('0xd4Af9FFDf2067d4CA422526D308E08CDBE690642');
    expect(isSpryDeployed(base)).toBe(true);

    for (const chainId of [ChainId.SEPOLIA, ChainId.UNICHAIN_SEPOLIA]) {
      const config = requireSpryConfig(chainId);
      expect(config.addresses.spryHook).toBe(PLACEHOLDER_ADDRESS);
      expect(config.addresses.quoter).toBe(PLACEHOLDER_ADDRESS);
      expect(config.addresses.stateView).toBe(PLACEHOLDER_ADDRESS);
      expect(isSpryDeployed(config)).toBe(false);
    }
    // Base Sepolia has a subgraph endpoint; the other chains do not yet.
    expect(base.subgraphUrl).toContain('goldsky.com');
    for (const chainId of [ChainId.SEPOLIA, ChainId.UNICHAIN_SEPOLIA]) {
      expect(requireSpryConfig(chainId).subgraphUrl).toBeNull();
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
  // Base Sepolia is deployed, so the configured hook is the real address.
  const validKey = { hooks: config.addresses.spryHook, fee: DYNAMIC_FEE_FLAG, tickSpacing: 60 };

  it('accepts a well-formed key (case-insensitive hook match)', () => {
    expect(isSpryPoolKey(validKey, config)).toBe(true);
    expect(isSpryPoolKey({ ...validKey, hooks: config.addresses.spryHook.toLowerCase() }, config)).toBe(true);
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
