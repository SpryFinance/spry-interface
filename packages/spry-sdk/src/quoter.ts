// V4Quoter client: the AUTHORITATIVE execution-pricing source (brief section 5).
//
// Never price a trade from @spry/fee's curve or the subgraph; always quote here.
// The quote functions are nonpayable (they simulate the swap and return), so
// they are called via viem's `simulateContract` (an eth_call), not `readContract`.
//
// To derive the implied current fee for a preview/slippage, pair the quoted
// `net` amount with the zero-fee constant-product `gross` (computed from pool
// state via @spry/fee) and feed both to @spry/slippage's impliedFee* helpers.

import { v4QuoterAbi } from './abi';
import type { Address, Hex, PathKey, PoolKey } from './types';

const EMPTY_HOOK_DATA: Hex = '0x';

/** Params for a single-hop quote (`QuoteExactSingleParams`). */
export interface QuoteExactSingleParams {
  poolKey: PoolKey;
  zeroForOne: boolean;
  /** uint128: the exact input (exact-in) or exact output (exact-out) amount. */
  exactAmount: bigint;
  hookData?: Hex;
}

/** Params for a multi-hop quote (`QuoteExactParams`). */
export interface QuoteExactParams {
  exactCurrency: Address;
  path: PathKey[];
  exactAmount: bigint;
}

type QuoteFunctionName =
  | 'quoteExactInputSingle'
  | 'quoteExactOutputSingle'
  | 'quoteExactInput'
  | 'quoteExactOutput';

/** A viem-ready descriptor for a quote call (pass to `simulateContract`). */
export interface QuoteRequest {
  address: Address;
  abi: typeof v4QuoterAbi;
  functionName: QuoteFunctionName;
  args: readonly unknown[];
}

function single(p: QuoteExactSingleParams) {
  return {
    poolKey: p.poolKey,
    zeroForOne: p.zeroForOne,
    exactAmount: p.exactAmount,
    hookData: p.hookData ?? EMPTY_HOOK_DATA,
  };
}
function multi(p: QuoteExactParams) {
  return { exactCurrency: p.exactCurrency, path: p.path, exactAmount: p.exactAmount };
}

export function quoteExactInputSingleRequest(quoter: Address, p: QuoteExactSingleParams): QuoteRequest {
  return { address: quoter, abi: v4QuoterAbi, functionName: 'quoteExactInputSingle', args: [single(p)] };
}
export function quoteExactOutputSingleRequest(quoter: Address, p: QuoteExactSingleParams): QuoteRequest {
  return { address: quoter, abi: v4QuoterAbi, functionName: 'quoteExactOutputSingle', args: [single(p)] };
}
export function quoteExactInputRequest(quoter: Address, p: QuoteExactParams): QuoteRequest {
  return { address: quoter, abi: v4QuoterAbi, functionName: 'quoteExactInput', args: [multi(p)] };
}
export function quoteExactOutputRequest(quoter: Address, p: QuoteExactParams): QuoteRequest {
  return { address: quoter, abi: v4QuoterAbi, functionName: 'quoteExactOutput', args: [multi(p)] };
}

/**
 * Injected simulate function: runs a quote call and returns its two return
 * values `[amount, gasEstimate]`. A thin adapter over viem's
 * `simulateContract` (`async (req) => (await publicClient.simulateContract(req)).result`).
 */
export interface SimulateQuoteFn {
  (request: QuoteRequest): Promise<readonly [bigint, bigint]>;
}

export interface SpryQuoterClient {
  quoterAddress: Address;
  quoteExactInputSingle(p: QuoteExactSingleParams): Promise<{ amountOut: bigint; gasEstimate: bigint }>;
  quoteExactOutputSingle(p: QuoteExactSingleParams): Promise<{ amountIn: bigint; gasEstimate: bigint }>;
  quoteExactInput(p: QuoteExactParams): Promise<{ amountOut: bigint; gasEstimate: bigint }>;
  quoteExactOutput(p: QuoteExactParams): Promise<{ amountIn: bigint; gasEstimate: bigint }>;
}

export function createSpryQuoterClient(simulate: SimulateQuoteFn, quoterAddress: Address): SpryQuoterClient {
  return {
    quoterAddress,
    async quoteExactInputSingle(p) {
      const [amountOut, gasEstimate] = await simulate(quoteExactInputSingleRequest(quoterAddress, p));
      return { amountOut, gasEstimate };
    },
    async quoteExactOutputSingle(p) {
      const [amountIn, gasEstimate] = await simulate(quoteExactOutputSingleRequest(quoterAddress, p));
      return { amountIn, gasEstimate };
    },
    async quoteExactInput(p) {
      const [amountOut, gasEstimate] = await simulate(quoteExactInputRequest(quoterAddress, p));
      return { amountOut, gasEstimate };
    },
    async quoteExactOutput(p) {
      const [amountIn, gasEstimate] = await simulate(quoteExactOutputRequest(quoterAddress, p));
      return { amountIn, gasEstimate };
    },
  };
}
