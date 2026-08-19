import React from 'react';
import { THEME_PRESETS, type ThemePresetId } from '../../utils/themes';

interface ThemePickerProps {
  value: ThemePresetId;
  onChange: (value: ThemePresetId) => void;
}

const ThemePicker: React.FC<ThemePickerProps> = ({ value, onChange }) => (
  <section className="mt-5 rounded-2xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-400">Оформление сайта</p>
        <h2 className="mt-1 text-lg font-black text-white">Цветовая схема</h2>
      </div>
      <p className="text-xs text-slate-500">Выбор применяется в превью сразу, на сайте — после сохранения.</p>
    </div>

    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {THEME_PRESETS.map((preset) => {
        const active = value === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            className={`overflow-hidden rounded-xl border text-left transition ${active ? 'border-teal-400 ring-2 ring-teal-400/20' : 'border-slate-700 hover:border-slate-500'}`}
            aria-pressed={active}
          >
            <div data-theme={preset.id} className="site-shell relative h-24 overflow-hidden p-4">
              <div className="theme-hero-glow absolute inset-0" />
              <div className="relative">
                <span className="theme-accent-text text-[10px] font-black uppercase tracking-[0.2em]">VG.ART</span>
                <div className="mt-3 h-2 w-24 rounded-full bg-white/80" />
                <div className="theme-accent-bg mt-3 h-5 w-16 rounded-full" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-slate-800 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{preset.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">{preset.description}</p>
              </div>
              <div className="flex shrink-0 -space-x-1">
                {preset.colors.map((color) => <span key={color} className="h-5 w-5 rounded-full border-2 border-slate-800" style={{ backgroundColor: color }} />)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  </section>
);

export default ThemePicker;
