// SPRY: the single source of truth for Spry's per-chain ERC20 tokens.
//
// The Uniswap gateway / asset repo do not serve these testnet tokens, so listing
// a token HERE is what makes it:
//   - appear in the token selector (it feeds COMMON_BASES, see routing.ts),
//   - carry a logo (getTokenLogoURI consults getSpryTokenLogo), and
//   - get a live on-chain balance (useSpryOnchainBalances reads COMMON_BASES).
//
// To add a token to a chain, add ONE entry to SPRY_TOKENS below - nothing else.
// (Native ETH and WETH come from the chain config and need no entry.)

import { Token } from '@uniswap/sdk-core'
import { uniswapUrls } from 'uniswap/src/constants/urls'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
import { UniverseChainId } from 'uniswap/src/features/chains/types'

// Canonical USDC mark from the Uniswap asset repo (keyed by the mainnet USDC
// address so it resolves regardless of the testnet USDC address). CSP img-src is `*`.
const USDC_LOGO = `${uniswapUrls.uniswapAssetsBlockchainsBaseUrl}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`
// The Spry brand mark, served from the web app's own public dir (same-origin).
const SPRY_LOGO = '/images/512x512_App_Icon.png'

/** A curated Spry ERC20 token on one chain. `address` MUST be lowercase. */
export interface SpryTokenDef {
  address: string
  symbol: string
  name: string
  decimals: number
  logoUrl: string
}

export const SPRY_TOKENS: Partial<Record<number, SpryTokenDef[]>> = {
  [UniverseChainId.UnichainSepolia]: [
    { address: '0xc12e5fbdf51a2788fa55661253f3960477508bef', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoUrl: USDC_LOGO },
    { address: '0xf677e51be78ac6b806114d5050f85463c25f6022', symbol: 'SPRY', name: 'Spry Token', decimals: 18, logoUrl: SPRY_LOGO },
  ],
  [UniverseChainId.BaseSepolia]: [
    { address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoUrl: USDC_LOGO },
    { address: '0xb56d680aea10bb81414851c44f46c8e315932342', symbol: 'sptA', name: 'Spry Test Token A', decimals: 18, logoUrl: SPRY_LOGO },
    { address: '0xbebc724ee71f74cadfd927ed235e4dc71ff28c8b', symbol: 'sptB', name: 'Spry Test Token B', decimals: 18, logoUrl: SPRY_LOGO },
  ],
}

/** SDK `Token` objects for a chain's curated Spry tokens (consumed by COMMON_BASES). */
export function spryTokensForChain(chainId: number): Token[] {
  return (SPRY_TOKENS[chainId] ?? []).map((t) => new Token(chainId, t.address, t.decimals, t.symbol, t.name))
}

/** The curated logo for a Spry token, or `undefined` if it is not in the registry. */
export function getSpryTokenLogo(chainId: number, address: string): string | undefined {
  const normalized = normalizeTokenAddressForCache(address)
  return SPRY_TOKENS[chainId]?.find((t) => t.address === normalized)?.logoUrl
}
