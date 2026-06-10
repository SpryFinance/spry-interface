import { isSVMAddress } from 'utilities/src/addresses/svm/svm'

describe('isSVMAddress', () => {
  it('accepts well-known Solana public keys', () => {
    // WSOL mint
    expect(isSVMAddress('So11111111111111111111111111111111111111112')).toBe(true)
    // USDC mint
    expect(isSVMAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true)
    // System program (all zero bytes: 32 leading '1' characters)
    expect(isSVMAddress('11111111111111111111111111111111')).toBe(true)
    // Token program
    expect(isSVMAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toBe(true)
  })

  it('rejects strings outside the 32-44 character range', () => {
    expect(isSVMAddress('')).toBe(false)
    expect(isSVMAddress('abc')).toBe(false)
    expect(isSVMAddress('1111111111111111111111111111111')).toBe(false) // 31 chars
    expect(isSVMAddress('z'.repeat(45))).toBe(false)
  })

  it('rejects non-base58 characters', () => {
    // EVM address: contains 0 and x, both outside the base58 alphabet
    expect(isSVMAddress('0xb56d680aea10bb81414851c44f46c8e315932342')).toBe(false)
    // 0, O, I, l are excluded from base58
    expect(isSVMAddress('O'.repeat(40))).toBe(false)
    expect(isSVMAddress('l'.repeat(40))).toBe(false)
  })

  it('rejects valid base58 that does not decode to exactly 32 bytes', () => {
    // 44 z characters decode to 33 bytes (58^44 exceeds 2^256)
    expect(isSVMAddress('z'.repeat(44))).toBe(false)
    // 32 z characters decode to only 24 bytes
    expect(isSVMAddress('z'.repeat(32))).toBe(false)
    // 33 leading '1' characters encode 33 zero bytes
    expect(isSVMAddress('1'.repeat(33))).toBe(false)
    // 31 leading zero bytes plus one 0x01 byte IS a valid 32-byte key
    expect(isSVMAddress(`${'1'.repeat(31)}2`)).toBe(true)
  })
})
