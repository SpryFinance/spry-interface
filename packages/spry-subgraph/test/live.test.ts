import { describe, it, expect } from 'vitest';
import { ChainId } from '@spry/config';
import {
  createSpryGraphClientForChain,
  fetchPools,
  fetchTiers,
  fetchPoolSwaps,
  fetchPoolWindows,
} from '../src/index';

// Live checks against the deployed Base Sepolia Spry subgraph (Goldsky). Skipped
// unless SPRY_LIVE_SUBGRAPH is set.
//   SPRY_LIVE_SUBGRAPH=1 npx vitest run packages/spry-subgraph/test/live.test.ts
const enabled = process.env.SPRY_LIVE_SUBGRAPH;

describe.skipIf(!enabled)('live Spry subgraph (Base Sepolia)', () => {
  const client = createSpryGraphClientForChain(ChainId.BASE_SEPOLIA);

  it('indexes without errors', async () => {
    const meta = await client.request<{ _meta: { hasIndexingErrors: boolean; block: { number: number } } }>(
      '{ _meta { hasIndexingErrors block { number } } }',
    );
    expect(meta._meta.hasIndexingErrors).toBe(false);
    expect(meta._meta.block.number).toBeGreaterThan(0);
  });

  it('the deployed Pool type exposes the Spry fields the queries use', async () => {
    const data = await client.request<{ __type: { fields: { name: string }[] } }>(
      '{ __type(name: "Pool") { fields { name } } }',
    );
    const names = data.__type.fields.map((f) => f.name);
    for (const field of ['tier', 'baseFeePips', 'capFeePips', 'avgFeePips', 'spryFeeWindows', 'spryFeeObservations']) {
      expect(names, field).toContain(field);
    }
  });

  it('runs the section-13 queries (may be empty until pools exist)', async () => {
    const tiers = await fetchTiers(client);
    expect(Array.isArray(tiers)).toBe(true);

    const pools = await fetchPools(client, { first: 5 });
    expect(Array.isArray(pools)).toBe(true);

    const first = pools[0];
    if (first) {
      // eslint-disable-next-line no-console
      console.log(`pool ${first.id}: tier=${first.tier} feeTier=${first.feeTier}`);
      expect(Array.isArray(await fetchPoolSwaps(client, first.id, { first: 5 }))).toBe(true);
      expect(Array.isArray(await fetchPoolWindows(client, first.id, { first: 5 }))).toBe(true);
    } else {
      // eslint-disable-next-line no-console
      console.log('no Spry pools indexed yet on Base Sepolia');
    }
  });
});
