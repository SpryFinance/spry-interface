import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export enum AppearanceSettingType {
  System = 'system',
  Light = 'light',
  Dark = 'dark',
}

export interface AppearanceSettingsState {
  selectedAppearanceSettings: AppearanceSettingType
}

export const initialAppearanceSettingsState: AppearanceSettingsState = {
  // SPRY: Spry is a dark-only brand (charcoal + violet), so default new users to
  // Dark instead of System. The appearance toggle still works for anyone who wants it.
  selectedAppearanceSettings: AppearanceSettingType.Dark,
}

const slice = createSlice({
  name: 'appearanceSettings',
  initialState: initialAppearanceSettingsState,
  reducers: {
    setSelectedAppearanceSettings: (state, action: PayloadAction<AppearanceSettingType>) => {
      state.selectedAppearanceSettings = action.payload
    },
    resetAppearanceSettings: () => initialAppearanceSettingsState,
  },
})

export const { setSelectedAppearanceSettings, resetAppearanceSettings } = slice.actions

export const appearanceSettingsReducer = slice.reducer
