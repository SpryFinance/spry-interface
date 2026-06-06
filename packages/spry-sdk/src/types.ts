import type { Address, Hex } from 'viem';

export type { Address, Hex };

/** The native-currency sentinel in v4 (`Currency.wrap(address(0))`). */
export const NATIVE_CURRENCY = '0x0000000000000000000000000000000000000000' as const;

/** A v4 `PoolKey`. For Spry pools, `fee` is the dynamic-fee flag and `hooks` is the SpryHook. */
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  /** uint24. `DYNAMIC_FEE_FLAG` (0x800000) for Spry pools. */
  fee: number;
  /** int24. The tier's tick spacing for Spry pools. */
  tickSpacing: number;
  hooks: Address;
}

/** A v4-periphery `PathKey` (one hop of a multi-hop route). */
export interface PathKey {
  intermediateCurrency: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  hookData: Hex;
}

/** A ready-to-send transaction request (`value` is the native ETH to attach). */
export interface SpryTxRequest {
  to: Address;
  data: Hex;
  value: bigint;
}

// --- Permit2 (IAllowanceTransfer) structs, mirroring the router ABI ---

export interface PermitDetails {
  token: Address;
  /** uint160 */
  amount: bigint;
  /** uint48 */
  expiration: number;
  /** uint48 */
  nonce: number;
}

export interface PermitSingle {
  details: PermitDetails;
  spender: Address;
  sigDeadline: bigint;
}

export interface PermitBatch {
  details: PermitDetails[];
  spender: Address;
  sigDeadline: bigint;
}
