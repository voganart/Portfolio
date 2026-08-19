export const THEME_PRESETS = [
  {
    id: 'midnight-violet',
    name: 'Midnight Violet',
    description: 'Фиолетовый фон и бирюзовые акценты',
    colors: ['#020617', '#3b0764', '#2dd4bf'],
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    description: 'Холодный синий фон и яркий циан',
    colors: ['#020b18', '#082f49', '#22d3ee'],
  },
  {
    id: 'ember-night',
    name: 'Ember Night',
    description: 'Тёмный бордовый фон и янтарный акцент',
    colors: ['#14070a', '#4c0519', '#f59e0b'],
  },
] as const;

export type ThemePresetId = typeof THEME_PRESETS[number]['id'];

export interface SiteTheme {
  preset: ThemePresetId;
}

export const DEFAULT_THEME: SiteTheme = { preset: 'midnight-violet' };

export const normalizeTheme = (value: unknown): SiteTheme => {
  const preset = typeof value === 'object' && value !== null && 'preset' in value
    ? (value as { preset?: unknown }).preset
    : null;
  return THEME_PRESETS.some((item) => item.id === preset)
    ? { preset: preset as ThemePresetId }
    : DEFAULT_THEME;
};
