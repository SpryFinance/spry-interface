import { describe, expect, it, vi } from 'vitest'
import { createUniRpcConfigResolver } from './getUniRpcConfig'
import { UniverseChainId } from './types'

// getUniRpcConfig imports the logger (used only on the error path); mock it so the
// module's logger reference doesn't touch __DEV__ in the node test env.
vi.mock('utilities/src/logger/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const baseCtx = {
  getEntryGatewayUrl: () => 'https://gw.example',
  requestSource: 'test',
}

describe('createUniRpcConfigResolver', () => {
  it('skips UniRPC for Base Sepolia so it falls back to the direct RPC', () => {
    const resolve = createUniRpcConfigResolver({ ...baseCtx, getFeatureFlag: () => true })
    // Returning null makes resolveRpcConfig fall through to the chain's direct RPC
    // (sepolia.base.org). The entry-gateway proxy returns 401 for Base Sepolia.
    expect(resolve({ chainId: UniverseChainId.BaseSepolia })).toBeNull()
  })

  it('returns the UniRPC gateway config for gateway-served chains', () => {
    const resolve = createUniRpcConfigResolver({ ...baseCtx, getFeatureFlag: () => true })
    expect(resolve({ chainId: UniverseChainId.Mainnet })?.rpcUrl).toBe('https://gw.example/rpc/1')
  })

  it('returns null when the UniRPC feature flag is off', () => {
    const resolve = createUniRpcConfigResolver({ ...baseCtx, getFeatureFlag: () => false })
    expect(resolve({ chainId: UniverseChainId.Mainnet })).toBeNull()
  })
})
