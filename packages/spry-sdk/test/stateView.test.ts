import { describe, it, expect } from 'vitest';
import { decodeFunctionData, encodeFunctionData, getAddress } from 'viem';
import {
  stateViewAbi,
  getSlot0Request,
  getLiquidityRequest,
  createSpryStateViewClient,
  type StateViewReadFn,
} from '../src/index';

const STATE_VIEW = getAddress('0x571291b572ed32ce6751a2Cb2486EbEe8DEfB9B4');
const POOL_ID = `0x${'ab'.repeat(32)}` as const;
const Q96 = 1n << 96n;

describe('StateView request builders', () => {
  it('encode getSlot0 / getLiquidity against the ABI', () => {
    const s = getSlot0Request(STATE_VIEW, POOL_ID);
    const ds = decodeFunctionData({
      abi: stateViewAbi,
      data: encodeFunctionData({ abi: stateViewAbi, functionName: s.functionName, args: s.args }),
    });
    expect(ds.functionName).toBe('getSlot0');
    expect(ds.args).toEqual([POOL_ID]);

    const l = getLiquidityRequest(STATE_VIEW, POOL_ID);
    const dl = decodeFunctionData({
      abi: stateViewAbi,
      data: encodeFunctionData({ abi: stateViewAbi, functionName: l.functionName, args: l.args }),
    });
    expect(dl.functionName).toBe('getLiquidity');
    expect(dl.args).toEqual([POOL_ID]);
  });
});

describe('SpryStateViewClient', () => {
  const read: StateViewReadFn = async (req) => {
    if (req.functionName === 'getSlot0') return [Q96, 0, 0, 0];
    if (req.functionName === 'getLiquidity') return 1_000_000n;
    throw new Error(`unexpected read: ${req.functionName}`);
  };
  const client = createSpryStateViewClient(read, STATE_VIEW);

  it('parses slot0', async () => {
    expect(await client.getSlot0(POOL_ID)).toEqual({ sqrtPriceX96: Q96, tick: 0, protocolFee: 0, lpFee: 0 });
  });

  it('reads liquidity', async () => {
    expect(await client.getLiquidity(POOL_ID)).toBe(1_000_000n);
  });

  it('derives virtual reserves via @spry/fee', async () => {
    // sqrtPriceX96 = Q96 (price 1) + liquidity 1e6 -> balanced reserves.
    expect(await client.getVirtualReserves(POOL_ID)).toEqual({ reserve0: 1_000_000n, reserve1: 1_000_000n });
  });
});
