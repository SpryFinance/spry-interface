// SPRY: Solana support is pruned, but this validator stays because stranded
// type-level code (SolanaToken, the Solana chain info that the exhaustive
// chain maps require, Unicon rendering) still calls it - including at module
// load. It is implemented dependency-free so @solana/web3.js can be removed.

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Checks if the given input string is a valid 32-byte base58-encoded string,
 * which is the format used for Solana public keys.
 *
 * Mirrors `new PublicKey(input)` validation from @solana/web3.js: the input
 * must decode (strict base58) to exactly 32 bytes.
 *
 * @param input - The string to check.
 * @returns True if the input is a valid 32-byte base58 string, false otherwise.
 */
export const isSVMAddress = (input: string): boolean => {
  // 32 bytes encode to between 32 ('1' repeated, all zero bytes) and 44 base58 characters.
  if (input.length < 32 || input.length > 44) {
    return false
  }

  // Leading '1' characters each encode one leading zero byte.
  let leadingZeros = 0
  while (leadingZeros < input.length && input.charAt(leadingZeros) === '1') {
    leadingZeros += 1
  }

  // Decode the remainder as a base58 big integer into little-endian bytes.
  const bytes: number[] = []
  for (let idx = leadingZeros; idx < input.length; idx += 1) {
    const value = BASE58_ALPHABET.indexOf(input.charAt(idx))
    if (value === -1) {
      return false
    }
    let carry = value
    for (let i = 0; i < bytes.length; i += 1) {
      carry += (bytes[i] ?? 0) * 58
      bytes[i] = carry % 256
      carry = Math.floor(carry / 256)
    }
    while (carry > 0) {
      bytes.push(carry % 256)
      carry = Math.floor(carry / 256)
    }
  }

  return leadingZeros + bytes.length === 32
}
