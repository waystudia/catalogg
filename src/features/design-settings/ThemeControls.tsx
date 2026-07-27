import { useEffect, useState } from 'react';
import type { ThemeSettings } from '../../entities/models';

const normalizeHexColor = (value: string) => {
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
};

export function ColorSetting({
  label,
  value,
  palette,
  onChange
}: {
  label: string;
  value: string;
  palette: string[];
  onChange: (color: string) => void;
}) {
  const normalizedValue = normalizeHexColor(value) ?? '#000000';
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => setDraft(normalizedValue), [normalizedValue]);

  const updateColor = (color: string) => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    setDraft(normalized);
    onChange(normalized);
  };

  return (
    <div className="color-setting">
      <div className="color-setting__head">
        <h2>{label}</h2>
        <label>
          <span style={{ background: normalizedValue }} />
          <input type="color" value={normalizedValue} onChange={(event) => updateColor(event.target.value)} aria-label={label} />
        </label>
      </div>
      <input
        className="hex-input"
        value={draft}
        inputMode="text"
        maxLength={7}
        onBlur={() => setDraft(normalizedValue)}
        onChange={(event) => {
          const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`;
          setDraft(next);
          const normalized = normalizeHexColor(next);
          if (normalized) onChange(normalized);
        }}
        aria-label={`${label}: HEX`}
      />
      <div className="swatches">
        {palette.map((color) => (
          <button
            className={normalizedValue.toLowerCase() === color.toLowerCase() ? 'swatch is-active' : 'swatch'}
            style={{ background: color }}
            type="button"
            key={color}
            onClick={() => updateColor(color)}
            aria-label={color}
          />
        ))}
      </div>
    </div>
  );
}

export function BackgroundSetting({
  theme,
  palette,
  onChange
}: {
  theme: ThemeSettings;
  palette: string[];
  onChange: (patch: Partial<ThemeSettings>) => void;
}) {
  const gradientFrom = theme.background_gradient_from ?? theme.background_color;
  const gradientTo = theme.background_gradient_to ?? theme.accent_secondary ?? theme.background_color;
  const setMode = (backgroundType: ThemeSettings['background_type']) => {
    if (backgroundType === 'color') {
      onChange({ background_type: 'color', background_color: gradientFrom, background_image_url: '' });
    } else if (backgroundType === 'gradient') {
      onChange({
        background_type: 'gradient',
        background_color: gradientFrom,
        background_gradient_from: gradientFrom,
        background_gradient_to: gradientTo,
        background_image_url: ''
      });
    } else {
      onChange({ background_type: 'image' });
    }
  };

  return (
    <section className="background-setting">
      <div className="background-mode">
        {(['color', 'gradient', 'image'] as const).map((mode) => (
          <button className={theme.background_type === mode ? 'is-active' : ''} type="button" onClick={() => setMode(mode)} key={mode}>
            {{ color: 'Заливка', gradient: 'Градиент', image: 'Изображение' }[mode]}
          </button>
        ))}
      </div>
      {theme.background_type === 'gradient' ? (
        <>
          <ColorSetting label="Начальный цвет фона" value={gradientFrom} palette={palette} onChange={(color) => onChange({ background_type: 'gradient', background_color: color, background_gradient_from: color })} />
          <ColorSetting label="Конечный цвет фона" value={gradientTo} palette={palette} onChange={(color) => onChange({ background_type: 'gradient', background_gradient_to: color })} />
        </>
      ) : (
        <ColorSetting label="Фон приложения" value={theme.background_color} palette={palette} onChange={(color) => onChange({ background_type: 'color', background_color: color, background_image_url: '' })} />
      )}
    </section>
  );
}
