import { ArrowLeft } from 'lucide-react';
import type { Category, Product, Restaurant, ThemeSettings } from '../../entities/models';
import { DishEditorPage } from '../dish-editor/DishEditorPage';
import { useAdminStore, useThemeStore } from '../stores';
import { BackgroundSetting, ColorSetting } from './ThemeControls';

export function DesignEditor({
  editingProduct,
  categories,
  products,
  restaurant,
  onSaveProduct,
  onCloseProduct,
  onUpdateRestaurant,
  cartCount,
  onNavigate
}: {
  editingProduct: Product | null;
  categories: Category[];
  products: Product[];
  restaurant: Restaurant;
  onSaveProduct: (product: Product) => void;
  onCloseProduct: () => void;
  onUpdateRestaurant: (patch: Partial<Restaurant>) => void;
  cartCount: number;
  onNavigate: (target: 'home' | 'catalog' | 'drinks' | 'cabins' | 'profile' | 'backup') => void;
}) {
  const editor = useAdminStore((state) => state.editor);
  const setEditor = useAdminStore((state) => state.setEditor);
  const theme = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);

  if (!editor) {
    return null;
  }

  return (
    <div className={editor === 'dish' ? 'modal-backdrop modal-backdrop--dish-editor' : 'modal-backdrop'}>
      <section className={editor === 'dish' ? 'design-editor design-editor--dish' : 'design-editor'}>
        {editor === 'dish' ? (
          <DishEditorPage
            product={editingProduct}
            categories={categories}
            products={products}
            cartCount={cartCount}
            onBack={() => {
              onCloseProduct();
              setEditor(null);
            }}
            onSave={onSaveProduct}
            onNavigate={(target) => {
              onNavigate(target);
              if (target !== 'profile') {
                onCloseProduct();
                setEditor(null);
              }
            }}
          />
        ) : (
          <>
            <div className="editor-head">
              <h2>{editor === 'design' ? 'Редактор дизайна' : editor === 'settings' ? 'Настройки' : 'Категории'}</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  onCloseProduct();
                  setEditor(null);
                }}
              >
                <ArrowLeft />
              </button>
            </div>
            {editor === 'design' ? (
          <div className="theme-form">
            <BackgroundSetting theme={theme} palette={['#070809', '#101419', '#f7f3ec', '#f8fafc', '#fff7ed', '#f1f5f9']} onChange={updateTheme} />
            {[
              ['text_primary', 'Текст'],
              ['text_secondary', 'Вторичный текст'],
              ['card_color', 'Карточки'],
              ['accent_color', 'Акцент'],
              ['accent_secondary', 'Акцент 2']
            ].map(([key, label]) => (
              <ColorSetting
                key={key}
                label={label}
                value={String(theme[key as keyof ThemeSettings])}
                palette={['#e8a23a', '#ffd082', '#f8f5ef', '#ffffff', '#181510', '#111827']}
                onChange={(color) => updateTheme({ [key]: color })}
              />
            ))}
            <label>
              Радиус карточек
              <input type="range" min="8" max="34" value={theme.card_radius} onChange={(event) => updateTheme({ card_radius: Number(event.target.value) })} />
            </label>
            <label>
              Радиус кнопок
              <input type="range" min="8" max="28" value={theme.button_radius} onChange={(event) => updateTheme({ button_radius: Number(event.target.value) })} />
            </label>
            <label>
              Фон-картинка
              <input value={theme.background_image_url} onChange={(event) => updateTheme({ background_image_url: event.target.value, background_type: event.target.value ? 'image' : 'color' })} placeholder="https://..." />
            </label>
            <label>
              Стиль кнопок
              <select value={theme.button_style} onChange={(event) => updateTheme({ button_style: event.target.value as ThemeSettings['button_style'] })}>
                <option value="filled">Заливка</option>
                <option value="outline">Обводка</option>
              </select>
            </label>
          </div>
        ) : editor === 'settings' ? (
          <div className="theme-form">
            <label>
              Название ресторана
              <input value={restaurant.name} onChange={(event) => onUpdateRestaurant({ name: event.target.value })} />
            </label>
            <label>
              WhatsApp для заказов
              <input value={restaurant.whatsapp} onChange={(event) => onUpdateRestaurant({ whatsapp: event.target.value.replace(/\D/g, '') })} placeholder="79990000000" />
            </label>
            <label>
              Instagram
              <input value={restaurant.instagram_url} onChange={(event) => onUpdateRestaurant({ instagram_url: event.target.value })} placeholder="https://instagram.com/..." />
            </label>
            <label>
              Адрес
              <input value={restaurant.address} onChange={(event) => onUpdateRestaurant({ address: event.target.value })} />
            </label>
            <label>
              Ссылка на карту
              <input value={restaurant.mapLink ?? ''} onChange={(event) => onUpdateRestaurant({ mapLink: event.target.value })} placeholder="https://yandex.ru/maps/..." />
            </label>
            <div className="import-export">
              <button
                className="primary-wide"
                type="button"
                onClick={() => {
                  onNavigate('backup');
                  onCloseProduct();
                  setEditor(null);
                }}
              >
                Открыть полный импорт и экспорт
              </button>
            </div>
          </div>
        ) : (
          <div className="admin-placeholder">
            <p>Категории готовы к Supabase-таблице category. Сейчас они используются как шаблон для карточек и фильтров.</p>
            <ul>
              {categories.map((category) => (
                <li key={category.id}>{category.name}</li>
              ))}
            </ul>
          </div>
        )}
          </>
        )}
      </section>
    </div>
  );
}
