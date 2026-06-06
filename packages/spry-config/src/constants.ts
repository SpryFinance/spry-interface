// Address constants shared across chains.

/** An EVM address. */
export type Address = `0x${string}`;

/**
 * Pre-deployment placeholder. Matches the sentinel the Spry subgraph uses in
 * `networks.json` for the not-yet-deployed hook. Any config field still set to
 * this is NOT real yet; guard with `isSpryDeployed` / `assertSpryDeployed`.
 */
export const PLACEHOLDER_ADDRESS: Address = '0xffffffffffffffffffffffffffffffffffffffff';

/** The zero address. */
export const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

/**
 * Canonical Permit2. The same address on every EVM chain (deterministic
 * deployment), so it is a constant rather than a per-chain field.
 */
export const PERMIT2_ADDRESS: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

/** Case-insensitive address equality. */
export function sameAddress(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** `true` iff `address` is the pre-deployment placeholder. */
export function isPlaceholder(address: string | undefined | null): boolean {
  return sameAddress(address, PLACEHOLDER_ADDRESS) || sameAddress(address, ZERO_ADDRESS);
}
