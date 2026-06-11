import { FeatureFlags, useFeatureFlag } from '@universe/gating'

/**
 * Builds the create-position route. SPRY: v4-only, so there is no `/positions/create/:version`
 * variant - the revamp flow uses `/positions/add`, otherwise plain `/positions/create`.
 */
export function buildCreatePositionHref({
  entryPoint,
  isAddLiquidityRevampEnabled,
}: {
  entryPoint?: string
  isAddLiquidityRevampEnabled: boolean
}): string {
  const path = isAddLiquidityRevampEnabled ? '/positions/add' : '/positions/create'
  const search = entryPoint ? new URLSearchParams({ entryPoint }).toString() : ''
  return search ? `${path}?${search}` : path
}

export function useCreatePositionHref({ entryPoint }: { entryPoint?: string } = {}): string {
  const isAddLiquidityRevampEnabled = useFeatureFlag(FeatureFlags.AddLiquidityRevamp)

  return buildCreatePositionHref({
    entryPoint,
    isAddLiquidityRevampEnabled,
  })
}
