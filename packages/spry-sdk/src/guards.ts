// Client-side guards from brief section 6.1: enforce these before submitting,
// or the router reverts (and for the recipient case, funds would be stranded).

import { sameAddress } from '@spry/config';
import { NATIVE_CURRENCY, type Address, type PathKey } from './types';

const TWO_POW_255 = 2n ** 255n;
const TWO_POW_256 = 2n ** 256n;

/** `true` iff `currency` is the native-ETH sentinel (the zero address). */
export function isNativeCurrency(currency: Address): boolean {
  return sameAddress(currency, NATIVE_CURRENCY);
}

/** The specified swap amount must fit a positive int256: `1 <= amount < 2^255`. */
export function assertSwapAmount(amount: bigint, label = 'amount'): void {
  if (amount < 1n || amount >= TWO_POW_255) {
    throw new RangeError(`${label} must satisfy 1 <= ${label} < 2^255 (got ${amount})`);
  }
}

/** A min/max limit amount must be a valid uint256. */
export function assertUint256(value: bigint, label: string): void {
  if (value < 0n || value >= TWO_POW_256) {
    throw new RangeError(`${label} must be a uint256 (got ${value})`);
  }
}

/** The deadline must be positive (pass a value greater than the current block timestamp). */
export function assertDeadline(deadline: bigint): void {
  if (deadline <= 0n) {
    throw new RangeError(`deadline must be positive (got ${deadline}); pass a value greater than the current block timestamp`);
  }
}

/** The recipient must not be the router: it has no sweep, so funds would be stranded. */
export function assertRecipientNotRouter(recipient: Address, router: Address): void {
  if (sameAddress(recipient, router)) {
    throw new Error('recipient must not be the SpryRouter: it has no sweep, so funds would be stranded');
  }
}

/** Permit2 swap paths are ERC-20-only: the pulled input must not be native ETH. */
export function assertErc20Input(currency: Address, label = 'input currency'): void {
  if (isNativeCurrency(currency)) {
    throw new Error(`${label} must be an ERC-20: Permit2 swap paths do not allow a native-ETH leg`);
  }
}

/** A multi-hop path must have at least one hop. */
export function assertNonEmptyPath(path: readonly PathKey[]): void {
  if (path.length < 1) throw new RangeError('path must have at least one hop');
}

/** Adjacent currencies in the hop sequence must differ (no `currency0 == currency1`). */
export function assertPathAdjacency(startCurrency: Address, path: readonly PathKey[]): void {
  assertNonEmptyPath(path);
  let prev = startCurrency;
  let i = 0;
  for (const hop of path) {
    if (sameAddress(prev, hop.intermediateCurrency)) {
      throw new Error(`path has a self-hop at index ${i}: adjacent currencies must differ`);
    }
    prev = hop.intermediateCurrency;
    i++;
  }
}

/**
 * Exact-OUTPUT adjacency. The exact-output path is forward (path[0] is the user's
 * INPUT side) but `endCurrency` (= currencyOut) is the END of the chain, so the
 * real sequence is path[0] -> ... -> path[n-1] -> endCurrency. Check every adjacent
 * pair, including the final hop against endCurrency. (The exact-input
 * `assertPathAdjacency` would instead check endCurrency against path[0], the wrong
 * pair: it both misses a degenerate final hop and rejects a valid cyclic route.)
 */
export function assertPathAdjacencyExactOut(endCurrency: Address, path: readonly PathKey[]): void {
  assertNonEmptyPath(path);
  const chain: Address[] = [...path.map((hop) => hop.intermediateCurrency), endCurrency];
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    if (a !== undefined && b !== undefined && sameAddress(a, b)) {
      throw new Error(`path has a self-hop at index ${i}: adjacent currencies must differ`);
    }
  }
}
