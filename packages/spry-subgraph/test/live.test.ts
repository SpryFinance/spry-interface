import { describe, it, expect } from 'vitest';
import { ChainId } from '@spry/config';
import { TIER_PARAMS, marginalFee, zoneOf, dispatchCase } from '@spry/fee';
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
const enabled = process.env['SPRY_LIVE_SUBGRAPH'];

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

  it('@spry/fee reproduces the on-chain fee of indexed swaps', async () => {
    const pools = await fetchPools(client, { first: 1 });
    const pool = pools[0];
    if (!pool) {
      // eslint-disable-next-line no-console
      console.log('no pools yet; skipping swap reproduction');
      return;
    }
    const swaps = await fetchPoolSwaps(client, pool.id, { first: 10 });
    if (swaps.length === 0) {
      // eslint-disable-next-line no-console
      console.log('no swaps indexed yet; skipping swap reproduction');
      return;
    }
    const params = TIER_PARAMS[pool.tier];
    let reproduced = 0;
    for (const s of swaps) {
      if (s.cumBefore === null || s.cumAfter === null) continue;
      const cumBefore = BigInt(s.cumBefore);
      const cumAfter = BigInt(s.cumAfter);
      // The JS curve must reproduce the exact per-swap fee the contract charged.
      expect(marginalFee(cumBefore, cumAfter, params), `fee for cum ${s.cumBefore}->${s.cumAfter}`).toBe(Number(s.fee));
      if (s.zone) expect(zoneOf(cumAfter, params)).toBe(s.zone);
      if (s.dispatchCase) expect(dispatchCase(cumBefore, cumAfter)).toBe(s.dispatchCase);
      reproduced++;
    }
    // eslint-disable-next-line no-console
    console.log(`reproduced ${reproduced} live swap fee(s) exactly (tier ${pool.tier})`);
    expect(reproduced).toBeGreaterThan(0);
  });
});
