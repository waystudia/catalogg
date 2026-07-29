import { ClipboardList, CloudUpload, Download, RefreshCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Cabin, CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../../entities/models';
import { SafeImage } from '../../shared/SafeImage';
import {
  createCatalogBackupPayload,
  downloadCatalogZip,
  getCurrentStock,
  getDailyStock,
  isLimitedProduct,
  readCatalogBackupFile,
  type CatalogBackupPayload
} from './catalogAdminModel';

export function StockSettings({
  products,
  onApplyOne,
  onApplyAll,
  onDecrement
}: {
  products: Product[];
  onApplyOne: (productId: string, dailyStock: number) => void;
  onApplyAll: () => void;
  onDecrement: (productId: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const limitedProducts = useMemo(() => products.filter(isLimitedProduct), [products]);

  useEffect(() => {
    setDraft(
      Object.fromEntries(
        limitedProducts.map((product) => [product.id, String(getDailyStock(product))])
      )
    );
  }, [limitedProducts]);

  const getQuantity = (productId: string) => {
    const value = Number(draft[productId]);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  };

  return (
    <main className="stock-page">
      <section className="stock-info-card">
        <span className="stock-info-card__icon">
          <ClipboardList />
        </span>
        <div>
          <h2>Обновить блюда</h2>
          <p>Задайте остаток на день. Кнопка -1 меняет текущий остаток, а здесь хранится дневная норма.</p>
        </div>
      </section>

      <button className="stock-refresh-all" type="button" onClick={onApplyAll}>
        <RefreshCcw />
        Обновить полностью
      </button>

      <section className="stock-card-list">
        {limitedProducts.map((product) => {
          const currentStock = getCurrentStock(product);
          return (
            <article className="stock-dish-card" key={product.id}>
              <SafeImage className="stock-dish-card__image" src={product.image_url} alt={product.title} />
              <div className="stock-dish-card__body">
                <h3>{product.title}</h3>
                <p>
                  <span aria-hidden="true" />
                  Сейчас осталось:{' '}
                  <strong>{currentStock <= 0 ? 'Закончилось' : currentStock}</strong>
                </p>
                <label>
                  Норма на день
                  <div className="stock-dish-card__controls">
                    <input
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      type="number"
                      value={draft[product.id] ?? ''}
                      onChange={(event) => setDraft((current) => ({ ...current, [product.id]: event.target.value }))}
                    />
                    <button type="button" onClick={() => onDecrement(product.id)} aria-label={`Уменьшить остаток ${product.title} на 1`}>
                      -1
                    </button>
                    <button type="button" onClick={() => onApplyOne(product.id, getQuantity(product.id))}>
                      Обновить
                    </button>
                  </div>
                </label>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export function BackupSettings({
  restaurant,
  categories,
  cabins,
  tags,
  products,
  theme,
  onImport
}: {
  restaurant: Restaurant;
  categories: Category[];
  cabins: Cabin[];
  tags: CatalogTag[];
  products: Product[];
  theme: ThemeSettings;
  onImport: (payload: CatalogBackupPayload) => void;
}) {
  const [error, setError] = useState('');
  const exportCatalog = () =>
    void downloadCatalogZip(createCatalogBackupPayload({ restaurant, categories, cabins, tags, products, theme })).catch(() => {
      setError('Не удалось собрать ZIP-архив.');
    });

  return (
    <main className="settings-screen">
      <section className="settings-form-card backup-card">
        <h2>Экспорт каталога</h2>
        <p>Сохраните полную резервную копию: меню, блюда, фото, категории, метки, залы, дизайн и контакты.</p>
        <button className="primary-wide" type="button" onClick={exportCatalog}>
          <Download /> Экспортировать ZIP
        </button>
      </section>
      <section className="settings-form-card backup-card">
        <h2>Импорт каталога</h2>
        <p>Загрузите ZIP-бэкап. JSON из старого экспорта тоже поддерживается.</p>
        {error && <p className="settings-error">{error}</p>}
        <label className="ghost-wide import-file">
          <CloudUpload /> Выбрать файл
          <input
            type="file"
            accept=".zip,application/zip,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setError('');
              try {
                onImport(await readCatalogBackupFile(file));
              } catch {
                setError('Не удалось прочитать файл импорта.');
              }
              event.target.value = '';
            }}
          />
        </label>
      </section>
      <section className="settings-info">
        <strong>Информация</strong>
        <p>Формат: ZIP с catalog.json и папкой assets для загруженных изображений. Рекомендуем делать бэкап перед импортом.</p>
      </section>
    </main>
  );
}

export function DeleteSettings({ onCancel, onDelete }: { onCancel: () => void; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <main className="delete-screen">
      <div className="delete-icon">
        <Trash2 />
      </div>
      <h2>Удалить весь каталог?</h2>
      <p>Будут удалены блюда, категории, метки и настройки. Это действие нельзя отменить.</p>
      {armed && <strong>Нажмите ещё раз, чтобы подтвердить удаление.</strong>}
      <div className="delete-actions">
        <button
          className="danger-wide"
          type="button"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            onDelete();
          }}
        >
          Удалить каталог
        </button>
        <button className="ghost-wide" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </main>
  );
}
