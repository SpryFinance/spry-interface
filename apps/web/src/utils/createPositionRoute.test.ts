import { buildCreatePositionHref } from '~/utils/createPositionRoute'

describe('createPositionRoute', () => {
  describe('buildCreatePositionHref', () => {
    it('should build the v4-only create-position route when the revamp is disabled', () => {
      expect(
        buildCreatePositionHref({
          entryPoint: '/portfolio/pools',
          isAddLiquidityRevampEnabled: false,
        }),
      ).toBe('/positions/create?entryPoint=%2Fportfolio%2Fpools')
    })

    it('should build the revamp create-position route when the revamp is enabled', () => {
      expect(
        buildCreatePositionHref({
          entryPoint: '/portfolio/pools',
          isAddLiquidityRevampEnabled: true,
        }),
      ).toBe('/positions/add?entryPoint=%2Fportfolio%2Fpools')
    })

    it('should omit the query string when no entry point is provided', () => {
      expect(buildCreatePositionHref({ isAddLiquidityRevampEnabled: false })).toBe('/positions/create')
    })
  })
})
