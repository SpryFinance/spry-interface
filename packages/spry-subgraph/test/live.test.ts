import { describe, it, expect } from 'vitest';
import { ChainId } from '@spry/config';
import { createSpryGraphClientForChain } from '../src/index';

// Live schema check against the deployed Base Sepolia Spry subgraph. Skipped
// unless SPRY_LIVE_SUBGRAPH is set. Uses introspection, which works even while
// the subgraph has an indexing error (data queries do not, until that is fixed).
//   SPRY_LIVE_SUBGRAPH=1 npx vitest run packages/spry-subgraph/test/live.test.ts
const enabled = process.env.SPRY_LIVE_SUBGRAPH;

describe.skipIf(!enabled)('live Spry subgraph (Base Sepolia schema)', () => {
  const client = createSpryGraphClientForChain(ChainId.BASE_SEPOLIA);

  it('the deployed Pool type exposes the Spry fields the queries use', async () => {
    const data = await client.request<{ __type: { fields: { name: string }[] } }>(
      '{ __type(name: "Pool") { fields { name } } }',
    );
    const names = data.__type.fields.map((f) => f.name);
    for (const field of ['tier', 'baseFeePips', 'capFeePips', 'avgFeePips', 'spryFeeWindows', 'spryFeeObservations']) {
      expect(names, field).toContain(field);
    }
  });
});
