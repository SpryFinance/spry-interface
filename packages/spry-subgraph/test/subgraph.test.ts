import { describe, it, expect } from 'vitest';
import {
  createSpryGraphClient,
  POOLS_QUERY,
  POOL_SWAPS_QUERY,
  POOL_WINDOWS_QUERY,
  TIERS_QUERY,
  fetchPools,
  fetchTiers,
  fetchPoolSwaps,
} from '../src/index';

function mockFetch(payload: unknown, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, json: async () => payload })) as unknown as typeof fetch;
}

describe('query documents (brief section 13)', () => {
  it('reference the expected Spry fields', () => {
    expect(POOLS_QUERY).toContain('tier');
    expect(POOLS_QUERY).toContain('feeTier');
    expect(POOLS_QUERY).toContain('avgFeePips');
    expect(POOL_SWAPS_QUERY).toContain('viaSpryRouter');
    expect(POOL_SWAPS_QUERY).toContain('dispatchCase');
    expect(POOL_WINDOWS_QUERY).toContain('spryFeeWindows');
    expect(POOL_WINDOWS_QUERY).toContain('cumOpen');
    expect(TIERS_QUERY).toContain('safeCount');
  });
});

describe('client', () => {
  it('returns data on success', async () => {
    const c = createSpryGraphClient('http://x', { fetchFn: mockFetch({ data: { tiers: [{ id: 'BLUE_CHIP' }] } }) });
    const d = await c.request<{ tiers: { id: string }[] }>(TIERS_QUERY);
    expect(d.tiers[0]?.id).toBe('BLUE_CHIP');
  });

  it('throws when there is no data (e.g. indexing_error)', async () => {
    const c = createSpryGraphClient('http://x', { fetchFn: mockFetch({ errors: [{ message: 'indexing_error' }] }) });
    await expect(c.request(TIERS_QUERY)).rejects.toThrow(/indexing_error/);
  });

  it('returns partial data when data and errors are both present', async () => {
    const c = createSpryGraphClient('http://x', {
      fetchFn: mockFetch({ data: { __type: { name: 'Pool' } }, errors: [{ message: 'indexing_error' }] }),
    });
    const d = await c.request<{ __type: { name: string } }>('{ __type(name:"Pool"){ name } }');
    expect(d.__type.name).toBe('Pool');
  });

  it('throws on an HTTP error', async () => {
    const c = createSpryGraphClient('http://x', { fetchFn: mockFetch({}, false, 500) });
    await expect(c.request(TIERS_QUERY)).rejects.toThrow(/HTTP 500/);
  });
});

describe('typed api unwraps the response', () => {
  it('fetchTiers / fetchPools / fetchPoolSwaps', async () => {
    const tiers = createSpryGraphClient('http://x', { fetchFn: mockFetch({ data: { tiers: [{ id: 'STABLE' }] } }) });
    expect(await fetchTiers(tiers)).toEqual([{ id: 'STABLE' }]);

    const pools = createSpryGraphClient('http://x', {
      fetchFn: mockFetch({ data: { pools: [{ id: '0xabc', tier: 'BLUE_CHIP' }] } }),
    });
    expect((await fetchPools(pools))[0]?.tier).toBe('BLUE_CHIP');

    const swaps = createSpryGraphClient('http://x', {
      fetchFn: mockFetch({ data: { swaps: [{ viaSpryRouter: true }] } }),
    });
    expect((await fetchPoolSwaps(swaps, '0xabc'))[0]?.viaSpryRouter).toBe(true);
  });
});
