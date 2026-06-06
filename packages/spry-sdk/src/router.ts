// SpryRouter swap calldata builders. Each returns a ready-to-send
// { to, data, value } with the brief section 6.1 guards enforced up front. The
// router only swaps (no LP, no sweep); LP goes through the canonical
// PositionManager. Execution pricing comes from the V4Quoter; size the
// min/max limits with @spry/slippage.

import { encodeFunctionData } from 'viem';
import { spryRouterAbi } from './abi';
import {
  assertDeadline,
  assertErc20Input,
  assertPathAdjacency,
  assertRecipientNotRouter,
  assertSwapAmount,
  assertUint256,
  isNativeCurrency,
} from './guards';
import type {
  Address,
  Hex,
  PathKey,
  PermitBatch,
  PermitSingle,
  PoolKey,
  SpryTxRequest,
} from './types';

const EMPTY_HOOK_DATA: Hex = '0x';

function inputCurrency(key: PoolKey, zeroForOne: boolean): Address {
  return zeroForOne ? key.currency0 : key.currency1;
}

// --- single-hop ----------------------------------------------------------

export interface ExactInputSingleArgs {
  router: Address;
  key: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMin: bigint;
  recipient: Address;
  deadline: bigint;
  hookData?: Hex;
}

export function buildSwapExactInputSingle(a: ExactInputSingleArgs): SpryTxRequest {
  assertSwapAmount(a.amountIn, 'amountIn');
  assertUint256(a.amountOutMin, 'amountOutMin');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactInputSingle',
    args: [a.key, a.zeroForOne, a.amountIn, a.amountOutMin, a.recipient, a.deadline, a.hookData ?? EMPTY_HOOK_DATA],
  });
  const input = inputCurrency(a.key, a.zeroForOne);
  return { to: a.router, data, value: isNativeCurrency(input) ? a.amountIn : 0n };
}

export function buildSwapExactInputSingleViaPermit2(a: ExactInputSingleArgs): SpryTxRequest {
  assertSwapAmount(a.amountIn, 'amountIn');
  assertUint256(a.amountOutMin, 'amountOutMin');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  assertErc20Input(inputCurrency(a.key, a.zeroForOne));
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactInputSingleViaPermit2',
    args: [a.key, a.zeroForOne, a.amountIn, a.amountOutMin, a.recipient, a.deadline, a.hookData ?? EMPTY_HOOK_DATA],
  });
  return { to: a.router, data, value: 0n };
}

export interface ExactOutputSingleArgs {
  router: Address;
  key: PoolKey;
  zeroForOne: boolean;
  amountOut: bigint;
  amountInMax: bigint;
  recipient: Address;
  deadline: bigint;
  hookData?: Hex;
}

export function buildSwapExactOutputSingle(a: ExactOutputSingleArgs): SpryTxRequest {
  assertSwapAmount(a.amountOut, 'amountOut');
  assertUint256(a.amountInMax, 'amountInMax');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactOutputSingle',
    args: [a.key, a.zeroForOne, a.amountOut, a.amountInMax, a.recipient, a.deadline, a.hookData ?? EMPTY_HOOK_DATA],
  });
  const input = inputCurrency(a.key, a.zeroForOne);
  return { to: a.router, data, value: isNativeCurrency(input) ? a.amountInMax : 0n };
}

export function buildSwapExactOutputSingleViaPermit2(a: ExactOutputSingleArgs): SpryTxRequest {
  assertSwapAmount(a.amountOut, 'amountOut');
  assertUint256(a.amountInMax, 'amountInMax');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  assertErc20Input(inputCurrency(a.key, a.zeroForOne));
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactOutputSingleViaPermit2',
    args: [a.key, a.zeroForOne, a.amountOut, a.amountInMax, a.recipient, a.deadline, a.hookData ?? EMPTY_HOOK_DATA],
  });
  return { to: a.router, data, value: 0n };
}

// --- multi-hop -----------------------------------------------------------

export interface ExactInputArgs {
  router: Address;
  currencyIn: Address;
  path: PathKey[];
  amountIn: bigint;
  amountOutMin: bigint;
  recipient: Address;
  deadline: bigint;
}

export function buildSwapExactInput(a: ExactInputArgs): SpryTxRequest {
  assertSwapAmount(a.amountIn, 'amountIn');
  assertUint256(a.amountOutMin, 'amountOutMin');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  assertPathAdjacency(a.currencyIn, a.path);
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactInput',
    args: [a.currencyIn, a.path, a.amountIn, a.amountOutMin, a.recipient, a.deadline],
  });
  return { to: a.router, data, value: isNativeCurrency(a.currencyIn) ? a.amountIn : 0n };
}

export function buildSwapExactInputViaPermit2(a: ExactInputArgs): SpryTxRequest {
  assertSwapAmount(a.amountIn, 'amountIn');
  assertUint256(a.amountOutMin, 'amountOutMin');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  assertErc20Input(a.currencyIn);
  assertPathAdjacency(a.currencyIn, a.path);
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactInputViaPermit2',
    args: [a.currencyIn, a.path, a.amountIn, a.amountOutMin, a.recipient, a.deadline],
  });
  return { to: a.router, data, value: 0n };
}

export interface ExactOutputArgs {
  router: Address;
  currencyOut: Address;
  path: PathKey[];
  amountOut: bigint;
  amountInMax: bigint;
  recipient: Address;
  deadline: bigint;
  /** For exactOutput the path is reversed, so the native input cannot be auto-detected; set this when the input currency is native ETH. */
  inputIsNative?: boolean;
}

export function buildSwapExactOutput(a: ExactOutputArgs): SpryTxRequest {
  assertSwapAmount(a.amountOut, 'amountOut');
  assertUint256(a.amountInMax, 'amountInMax');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  assertPathAdjacency(a.currencyOut, a.path);
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactOutput',
    args: [a.currencyOut, a.path, a.amountOut, a.amountInMax, a.recipient, a.deadline],
  });
  return { to: a.router, data, value: a.inputIsNative ? a.amountInMax : 0n };
}

export function buildSwapExactOutputViaPermit2(a: Omit<ExactOutputArgs, 'inputIsNative'>): SpryTxRequest {
  assertSwapAmount(a.amountOut, 'amountOut');
  assertUint256(a.amountInMax, 'amountInMax');
  assertRecipientNotRouter(a.recipient, a.router);
  assertDeadline(a.deadline);
  assertPathAdjacency(a.currencyOut, a.path);
  const data = encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'swapExactOutputViaPermit2',
    args: [a.currencyOut, a.path, a.amountOut, a.amountInMax, a.recipient, a.deadline],
  });
  return { to: a.router, data, value: 0n };
}

// --- batching: single-signature permit + swap via multicall --------------

/** Wrap a list of router calldatas in a single `multicall` (msg.value preserved). */
export function buildMulticall(router: Address, calls: readonly Hex[], value = 0n): SpryTxRequest {
  const data = encodeFunctionData({ abi: spryRouterAbi, functionName: 'multicall', args: [calls] });
  return { to: router, data, value };
}

export interface SelfPermitArgs {
  token: Address;
  value: bigint;
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
}

/** Encode an EIP-2612 `selfPermit` call (to batch ahead of a swap). */
export function encodeSelfPermit(a: SelfPermitArgs): Hex {
  return encodeFunctionData({
    abi: spryRouterAbi,
    functionName: 'selfPermit',
    args: [a.token, a.value, a.deadline, a.v, a.r, a.s],
  });
}

/** Encode a Permit2 `permit` (single) call. */
export function encodePermit(owner: Address, permitSingle: PermitSingle, signature: Hex): Hex {
  return encodeFunctionData({ abi: spryRouterAbi, functionName: 'permit', args: [owner, permitSingle, signature] });
}

/** Encode a Permit2 `permitBatch` call. */
export function encodePermitBatch(owner: Address, permitBatch: PermitBatch, signature: Hex): Hex {
  return encodeFunctionData({ abi: spryRouterAbi, functionName: 'permitBatch', args: [owner, permitBatch, signature] });
}

/** Batch an EIP-2612 `selfPermit` and a swap into one signature-free `multicall`. */
export function buildSelfPermitAndSwap(router: Address, permit: SelfPermitArgs, swap: SpryTxRequest): SpryTxRequest {
  return buildMulticall(router, [encodeSelfPermit(permit), swap.data], swap.value);
}

/** Batch a Permit2 `permit` and a (Permit2) swap into one `multicall`. */
export function buildPermit2AndSwap(
  router: Address,
  owner: Address,
  permitSingle: PermitSingle,
  signature: Hex,
  swap: SpryTxRequest,
): SpryTxRequest {
  return buildMulticall(router, [encodePermit(owner, permitSingle, signature), swap.data], swap.value);
}
