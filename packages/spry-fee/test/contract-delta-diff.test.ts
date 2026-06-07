import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { computeSignedDelta } from '../src/index';

// Differential test: computeSignedDelta vs the on-chain SmartFeeLib.
// Pure integer math, so the match is exact. Fixture from
// tools/contract-diff/script/DumpDeltas.s.sol.
const csv = readFileSync(new URL('./fixtures/contract-deltas.csv', import.meta.url), 'utf8');

describe('computeSignedDelta vs the on-chain SmartFeeLib', () => {
  it('matches the contract exactly for every grid point', () => {
    const rows = csv.trim().split('\n').slice(1); // drop header
    expect(rows.length).toBeGreaterThan(50);
    for (const row of rows) {
      const parts = row.split(',');
      if (parts.length !== 5) throw new Error(`malformed fixture row: ${row}`);
      const [sqrtPriceX96, liquidity, zeroForOne, amountSpecified, delta] = parts as [
        string,
        string,
        string,
        string,
        string,
      ];
      const got = computeSignedDelta({
        sqrtPriceX96: BigInt(sqrtPriceX96),
        liquidity: BigInt(liquidity),
        zeroForOne: zeroForOne === '1',
        amountSpecified: BigInt(amountSpecified),
      });
      expect(got, row).toBe(BigInt(delta));
    }
  });
});
