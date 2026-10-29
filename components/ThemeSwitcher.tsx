import React from 'react';
import { THEME_PRESETS, type ThemePresetId } from '../utils/themes';
import { useTranslations } from '../hooks/useTranslations';

interface ThemeSwitcherProps {
  value: ThemePresetId;
  onChange: (value: ThemePresetId) => void;
}

// Переключатель цветовой схемы для посетителя: кружки-свотчи с цветами пресетов
const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ value, onChange }) => {
  const { t } = useTranslations();
  return (
  <div role="radiogroup" aria-label={t.themeSwitcher.label} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 p-1">
    {THEME_PRESETS.map((preset) => {
      const active = value === preset.id;
      return (
        <button
          key={preset.id}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={preset.name}
          title={preset.name}
          onClick={() => onChange(preset.id)}
          className={`relative h-6 w-6 overflow-hidden rounded-full transition hover:scale-110 ${active ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-transparent' : 'opacity-70 hover:opacity-100'}`}
          style={{ background: `linear-gradient(135deg, ${preset.colors[1]} 0 50%, ${preset.colors[2]} 50% 100%)` }}
        />
      );
    })}
  </div>
  );
};

export default ThemeSwitcher;
