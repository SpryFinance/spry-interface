import { describe, it, expect } from 'vitest';
import { decodeFunctionData, encodeFunctionData, getAddress } from 'viem';
import {
  v4QuoterAbi,
  quoteExactInputSingleRequest,
  quoteExactOutputSingleRequest,
  quoteExactInputRequest,
  quoteExactOutputRequest,
  createSpryQuoterClient,
  type PoolKey,
  type PathKey,
  type QuoteRequest,
  type SimulateQuoteFn,
} from '../src/index';

const QUOTER = getAddress('0x7777777777777777777777777777777777777777');
const TOKEN_A = getAddress('0x2222222222222222222222222222222222222222');
const TOKEN_B = getAddress('0x3333333333333333333333333333333333333333');
const HOOK = getAddress('0x5555555555555555555555555555555555555555');

const KEY: PoolKey = { currency0: TOKEN_A, currency1: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK };
const PATH: PathKey[] = [{ intermediateCurrency: TOKEN_B, fee: 0x800000, tickSpacing: 60, hooks: HOOK, hookData: '0x' }];

function roundTrip(req: QuoteRequest) {
  const data = encodeFunctionData({ abi: v4QuoterAbi, functionName: req.functionName, args: req.args as never });
  return decodeFunctionData({ abi: v4QuoterAbi, data });
}

describe('quote request builders encode against the real ABI', () => {
  it('exact-in single', () => {
    const d = roundTrip(quoteExactInputSingleRequest(QUOTER, { poolKey: KEY, zeroForOne: true, exactAmount: 1_000n }));
    expect(d.functionName).toBe('quoteExactInputSingle');
    expect(d.args).toEqual([{ poolKey: KEY, zeroForOne: true, exactAmount: 1_000n, hookData: '0x' }]);
  });

  it('exact-out single (carries hookData)', () => {
    const d = roundTrip(
      quoteExactOutputSingleRequest(QUOTER, { poolKey: KEY, zeroForOne: false, exactAmount: 500n, hookData: '0xbeef' }),
    );
    expect(d.functionName).toBe('quoteExactOutputSingle');
    expect(d.args).toEqual([{ poolKey: KEY, zeroForOne: false, exactAmount: 500n, hookData: '0xbeef' }]);
  });

  it('exact-in multi-hop', () => {
    const d = roundTrip(quoteExactInputRequest(QUOTER, { exactCurrency: TOKEN_A, path: PATH, exactAmount: 1_000n }));
    expect(d.functionName).toBe('quoteExactInput');
    expect(d.args).toEqual([{ exactCurrency: TOKEN_A, path: PATH, exactAmount: 1_000n }]);
  });

  it('exact-out multi-hop', () => {
    const d = roundTrip(quoteExactOutputRequest(QUOTER, { exactCurrency: TOKEN_A, path: PATH, exactAmount: 500n }));
    expect(d.functionName).toBe('quoteExactOutput');
    expect(d.args).toEqual([{ exactCurrency: TOKEN_A, path: PATH, exactAmount: 500n }]);
  });
});

describe('SpryQuoterClient', () => {
  const calls: QuoteRequest[] = [];
  const simulate: SimulateQuoteFn = async (req) => {
    calls.push(req);
    return [777n, 21_000n];
  };
  const quoter = createSpryQuoterClient(simulate, QUOTER);

  it('parses exact-in as amountOut + gasEstimate and targets the quoter', async () => {
    const r = await quoter.quoteExactInputSingle({ poolKey: KEY, zeroForOne: true, exactAmount: 1_000n });
    expect(r).toEqual({ amountOut: 777n, gasEstimate: 21_000n });
    expect(calls[0]?.functionName).toBe('quoteExactInputSingle');
    expect(calls[0]?.address).toBe(QUOTER);
  });

  it('parses exact-out as amountIn + gasEstimate', async () => {
    const r = await quoter.quoteExactOutputSingle({ poolKey: KEY, zeroForOne: false, exactAmount: 500n });
    expect(r).toEqual({ amountIn: 777n, gasEstimate: 21_000n });
  });

  it('supports multi-hop quotes', async () => {
    const r = await quoter.quoteExactInput({ exactCurrency: TOKEN_A, path: PATH, exactAmount: 1_000n });
    expect(r).toEqual({ amountOut: 777n, gasEstimate: 21_000n });
  });
});
