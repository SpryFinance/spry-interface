// StateView reader: pool state (slot0 + liquidity) -> virtual reserves.
//
// Completes the client-side implied-fee preview: read the pool's sqrtPriceX96 +
// liquidity here, derive the zero-fee constant-product "gross" via @spry/fee,
// pair it with the Quoter's "net", and feed both to @spry/slippage's
// impliedFee* helpers. (Reads only; execution still prices via the Quoter.)

import { virtualReservesFromState, type VirtualReserves } from '@spry/fee';
import { stateViewAbi } from './abi';
import type { Address, Hex } from './types';

/** v4 pool slot0. */
export interface Slot0 {
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
}

/** Minimal readContract abstraction for StateView (a thin viem/wagmi adapter). */
export interface StateViewReadFn {
  (request: {
    address: Address;
    abi: typeof stateViewAbi;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
}

export function getSlot0Request(stateView: Address, poolId: Hex) {
  return { address: stateView, abi: stateViewAbi, functionName: 'getSlot0' as const, args: [poolId] as const };
}

export function getLiquidityRequest(stateView: Address, poolId: Hex) {
  return { address: stateView, abi: stateViewAbi, functionName: 'getLiquidity' as const, args: [poolId] as const };
}

export interface SpryStateViewClient {
  stateViewAddress: Address;
  getSlot0(poolId: Hex): Promise<Slot0>;
  getLiquidity(poolId: Hex): Promise<bigint>;
  /** Virtual reserves for the pool (slot0 + liquidity via @spry/fee). */
  getVirtualReserves(poolId: Hex): Promise<VirtualReserves>;
}

export function createSpryStateViewClient(read: StateViewReadFn, stateViewAddress: Address): SpryStateViewClient {
  async function getSlot0(poolId: Hex): Promise<Slot0> {
    const r = (await read(getSlot0Request(stateViewAddress, poolId))) as readonly [bigint, number, number, number];
    return { sqrtPriceX96: r[0], tick: r[1], protocolFee: r[2], lpFee: r[3] };
  }
  async function getLiquidity(poolId: Hex): Promise<bigint> {
    return (await read(getLiquidityRequest(stateViewAddress, poolId))) as bigint;
  }
  async function getVirtualReserves(poolId: Hex): Promise<VirtualReserves> {
    const [slot0, liquidity] = await Promise.all([getSlot0(poolId), getLiquidity(poolId)]);
    return virtualReservesFromState(slot0.sqrtPriceX96, liquidity);
  }
  return { stateViewAddress, getSlot0, getLiquidity, getVirtualReserves };
}
