import { CloudUpload } from 'lucide-react';
import type { ThemeSettings } from '../../entities/models';
import { imageFileToDataUrl } from '../../shared/images';
import { BackgroundSetting, ColorSetting } from './ThemeControls';
import { darkThemePreset, lightThemePreset } from './themePresets';
import { readableTextFor } from './themeUtils';

export function ThemeSettingsScreen({ theme, onChange }: { theme: ThemeSettings; onChange: (patch: Partial<ThemeSettings>) => void }) {
  const primaryColors = ['#e8a23a', '#3b82f6', '#16a34a', '#ef4444', '#a855f7', '#111827'];
  const accentColors = ['#ffd082', '#f59e0b', '#f97316', '#ec4899', '#06b6d4', '#84cc16'];
  const backgroundColors = ['#070809', '#101419', '#f7f3ec', '#f8fafc', '#fff7ed', '#f1f5f9'];
  const cardColors = ['#121416', '#1f2937', '#ffffff', '#fffaf0', '#f8fafc', '#0f172a'];
  const textColors = ['#f8f5ef', '#ffffff', '#181510', '#111827', '#292524', '#0f172a'];
  const mutedColors = ['#aaa39a', '#cbd5e1', '#766d62', '#64748b', '#57534e', '#475569'];
  const titleColors = ['#f8f5ef', '#ffffff', '#111827', '#181510', '#e8a23a', '#f97316'];

  const updateBackgroundImage = async (file?: File) => {
    if (!file) return;
    onChange({ background_image_url: await imageFileToDataUrl(file), background_type: 'image' });
  };

  return (
    <main className="settings-screen">
      <section className="settings-form-card">
        <h2>Тема</h2>
        <div className="choice-grid">
          <button className={theme.background_color === lightThemePreset.background_color ? 'choice-card is-active' : 'choice-card'} type="button" onClick={() => onChange(lightThemePreset)}>Светлая</button>
          <button className={theme.background_color !== lightThemePreset.background_color ? 'choice-card is-active' : 'choice-card'} type="button" onClick={() => onChange(darkThemePreset)}>Тёмная</button>
        </div>
        <label className="media-upload media-upload--cover">
          <input type="file" accept="image/*" onChange={(event) => void updateBackgroundImage(event.target.files?.[0])} />
          {theme.background_image_url ? <img src={theme.background_image_url} alt="" /> : <CloudUpload />}
          <span><strong>Фоновое изображение</strong><small>Выбрать из медиатеки</small></span>
        </label>
        {theme.background_image_url && <button className="ghost-wide" type="button" onClick={() => onChange({ background_image_url: '', background_type: 'color' })}>Убрать фоновое изображение</button>}
        <BackgroundSetting theme={theme} palette={backgroundColors} onChange={onChange} />
        <ColorSetting label="Основной цвет" value={theme.accent_color} palette={primaryColors} onChange={(color) => onChange({ accent_color: color })} />
        <ColorSetting label="Цвет акцента" value={theme.accent_secondary} palette={accentColors} onChange={(color) => onChange({ accent_secondary: color })} />
        <ColorSetting label="Цвет карточек" value={theme.card_color} palette={cardColors} onChange={(color) => onChange({ card_color: color })} />
        <ColorSetting label="Цвет текста" value={theme.text_primary} palette={textColors} onChange={(color) => onChange({ text_primary: color })} />
        <ColorSetting label="Вторичный текст" value={theme.text_secondary} palette={mutedColors} onChange={(color) => onChange({ text_secondary: color })} />
        <ColorSetting label="Карточки блюд" value={theme.product_card_color ?? theme.card_color} palette={cardColors} onChange={(color) => onChange({ product_card_color: color, product_card_text_color: readableTextFor(color) })} />
        <ColorSetting label="Текст карточек блюд" value={theme.product_card_text_color ?? theme.text_primary} palette={textColors} onChange={(color) => onChange({ product_card_text_color: color })} />
        <ColorSetting label="Карточки настроек" value={theme.settings_card_color ?? theme.card_color} palette={cardColors} onChange={(color) => onChange({ settings_card_color: color, settings_card_text_color: readableTextFor(color) })} />
        <ColorSetting label="Текст карточек настроек" value={theme.settings_card_text_color ?? theme.text_primary} palette={textColors} onChange={(color) => onChange({ settings_card_text_color: color })} />
        <ColorSetting label="Панель корзины" value={theme.cart_panel_color ?? '#111111'} palette={cardColors} onChange={(color) => onChange({ cart_panel_color: color, cart_panel_text_color: readableTextFor(color) })} />
        <ColorSetting label="Текст панели корзины" value={theme.cart_panel_text_color ?? theme.text_primary} palette={textColors} onChange={(color) => onChange({ cart_panel_text_color: color })} />
        <ColorSetting label="Названия категорий" value={theme.category_title_color ?? theme.text_primary} palette={titleColors} onChange={(color) => onChange({ category_title_color: color })} />
        <label className="range-field">
          <span>Скругление <b>{theme.card_radius}px</b></span>
          <input type="range" min="0" max="24" value={Math.min(theme.card_radius, 24)} onChange={(event) => onChange({ card_radius: Number(event.target.value), button_radius: Math.max(8, Number(event.target.value) - 2) })} />
        </label>
        <button className="primary-wide" type="button">Сохранить изменения</button>
      </section>
    </main>
  );
}
