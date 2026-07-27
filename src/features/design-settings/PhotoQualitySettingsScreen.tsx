import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '../../entities/models';
import {
  DEFAULT_PHOTO_QUALITY_SETTINGS,
  getPhotoQualityFilter,
  normalizePhotoQualitySettings,
  type PhotoQualitySettings
} from '../../shared/photoQuality';

const controls: Array<{
  key: Exclude<keyof PhotoQualitySettings, 'enabled'>;
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'saturation', label: 'Сочность / насыщенность', min: -100, max: 100 },
  { key: 'brightness', label: 'Яркость', min: -100, max: 100 },
  { key: 'contrast', label: 'Контрастность', min: -100, max: 100 },
  { key: 'colorfulness', label: 'Цветность', min: -100, max: 100 },
  { key: 'sharpness', label: 'Резкость', min: 0, max: 100 },
  { key: 'warmth', label: 'Теплота', min: -100, max: 100 }
];

const productImage = (product?: Product) => product?.image_urls?.[0] || product?.image_url || '';
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

export function PhotoQualitySettingsScreen({
  products,
  value,
  onSave
}: {
  products: Product[];
  value: PhotoQualitySettings;
  onSave: (settings: PhotoQualitySettings) => Promise<void>;
}) {
  const imageProducts = useMemo(() => products.filter((product) => Boolean(productImage(product))), [products]);
  const [draft, setDraft] = useState(() => normalizePhotoQualitySettings(value));
  const [selectedId, setSelectedId] = useState(imageProducts[0]?.id ?? '');
  const [showOriginal, setShowOriginal] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedProduct = imageProducts.find((product) => product.id === selectedId) ?? imageProducts[0];

  useEffect(() => setDraft(normalizePhotoQualitySettings(value)), [value]);
  useEffect(() => {
    if (!selectedId && imageProducts[0]) setSelectedId(imageProducts[0].id);
  }, [imageProducts, selectedId]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-screen photo-quality-screen">
      <p className="photo-quality-screen__intro">
        Отрегулируйте отображение фотографий блюд. Настройки автоматически применяются ко всему каталогу.
      </p>

      <section className="photo-quality-card photo-quality-toggle">
        <span>
          <strong>Автоматическая обработка фотографий</strong>
          <small>Применять настройки ко всем фотографиям блюд.</small>
        </span>
        <button
          className={draft.enabled ? 'settings-switch is-active' : 'settings-switch'}
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
        >
          <span />
        </button>
      </section>

      <section className="photo-quality-card photo-quality-preview">
        <h2>Предпросмотр</h2>
        <select value={selectedProduct?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} aria-label="Выбрать блюдо">
          {imageProducts.map((product) => <option value={product.id} key={product.id}>{product.title}</option>)}
        </select>
        {selectedProduct ? (
          <>
            <div className="photo-quality-preview__image">
              <img src={productImage(selectedProduct)} alt={selectedProduct.title} />
              {!showOriginal && draft.enabled && (
                <span>
                  <img src={productImage(selectedProduct)} alt="" style={{ filter: getPhotoQualityFilter(draft) }} />
                </span>
              )}
              <i />
              <b>До</b>
              <b>После</b>
            </div>
            <button className="ghost-wide" type="button" onClick={() => setShowOriginal((current) => !current)}>
              {showOriginal ? 'Показать сравнение' : 'Показать оригинал'}
            </button>
          </>
        ) : <p className="photo-quality-empty">Добавьте фотографию блюда, чтобы увидеть предпросмотр.</p>}
      </section>

      <section className={draft.enabled ? 'photo-quality-card photo-quality-controls' : 'photo-quality-card photo-quality-controls is-disabled'}>
        {controls.map((control) => (
          <label className="photo-quality-range" key={control.key}>
            <span><strong>{control.label}</strong><b>{signed(draft[control.key])}</b></span>
            <input
              type="range"
              min={control.min}
              max={control.max}
              value={draft[control.key]}
              disabled={!draft.enabled}
              onChange={(event) => setDraft((current) => ({ ...current, [control.key]: Number(event.target.value) }))}
            />
            <small><span>{control.min}</span><span>{control.max > 0 ? `+${control.max}` : control.max}</span></small>
          </label>
        ))}
        <button className="ghost-wide photo-quality-reset" type="button" onClick={() => setDraft({ ...DEFAULT_PHOTO_QUALITY_SETTINGS, enabled: draft.enabled })}>
          <RotateCcw /> Сбросить настройки
        </button>
      </section>

      <button className="primary-wide photo-quality-save" type="button" onClick={() => void save()} disabled={saving}>
        {saving ? 'Сохраняем...' : 'Сохранить'}
      </button>
    </main>
  );
}

