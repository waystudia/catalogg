import { Archive, PackagePlus, Save, ScanBarcode, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Category, Product } from '../../entities/models';
import { GroceryProductPhotoEditor } from './GroceryProductPhotoEditor';
import type { ProductPhotoProcessor } from '../shared-product-catalog/productPhotoBackground';
import { normalizeBarcode } from './barcodeScanner';

const makeDraft = (product: Product | null, barcode: string, fallbackCategory: string): Product => ({
  id: product?.id ?? crypto.randomUUID(),
  title: product?.title ?? '',
  price: product?.price ?? 0,
  description: product?.description ?? '',
  image_url: product?.image_url ?? '',
  image_urls: product?.image_urls ?? (product?.image_url ? [product.image_url] : []),
  ingredients: product?.ingredients ?? '',
  weight: product?.weight ?? '',
  spicy_level: product?.spicy_level ?? 0,
  serving: product?.serving ?? '',
  is_popular: product?.is_popular ?? false,
  is_new: product?.is_new ?? false,
  is_hit: product?.is_hit ?? false,
  is_hidden: product?.is_hidden ?? false,
  stock_count: product?.stock_count ?? 0,
  stock_quantity: product?.stock_quantity ?? product?.stock_count ?? 0,
  current_stock: product?.current_stock ?? product?.stock_count ?? 0,
  daily_stock: product?.daily_stock ?? product?.stock_count ?? 0,
  is_unlimited: product?.is_unlimited ?? false,
  category_id: product?.category_id ?? fallbackCategory,
  category_ids: product?.category_ids ?? (fallbackCategory ? [fallbackCategory] : []),
  pair_ids: product?.pair_ids ?? [],
  sku: product?.sku ?? '',
  barcode: normalizeBarcode(product?.barcode ?? barcode),
  cost_price: product?.cost_price ?? 0,
  minimum_stock: product?.minimum_stock ?? 0,
  sale_unit: product?.sale_unit ?? 'piece',
  quantity_unit: product?.quantity_unit ?? 'piece',
  price_basis_quantity: product?.price_basis_quantity ?? 1,
  minimum_quantity: product?.minimum_quantity ?? 1,
  quantity_step: product?.quantity_step ?? 1,
  allow_substitution: product?.allow_substitution ?? true
});

export function GroceryProductEditor({
  open,
  product,
  initialBarcode = '',
  categories,
  barcodeExists,
  onRequestScan,
  onClose,
  onSave,
  photoProcessor
}: {
  open: boolean;
  product: Product | null;
  initialBarcode?: string;
  categories: Category[];
  barcodeExists: (barcode: string, exceptProductId: string) => boolean;
  onRequestScan: () => void;
  onClose: () => void;
  onSave: (product: Product) => Promise<void> | void;
  photoProcessor?: ProductPhotoProcessor;
}) {
  const fallbackCategory = categories.find((category) => category.kind !== 'space')?.id ?? '';
  const [draft, setDraft] = useState(() => makeDraft(product, initialBarcode, fallbackCategory));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(makeDraft(product, '', fallbackCategory));
    setError('');
  }, [fallbackCategory, open, product]);

  useEffect(() => {
    if (!open || !initialBarcode) return;
    setDraft((current) => ({ ...current, barcode: normalizeBarcode(initialBarcode) }));
  }, [initialBarcode, open]);

  const margin = useMemo(() => {
    const amount = draft.price - (draft.cost_price ?? 0);
    const percent = draft.price > 0 ? Math.round((amount / draft.price) * 100) : 0;
    return { amount, percent };
  }, [draft.cost_price, draft.price]);

  const patch = (value: Partial<Product>) => setDraft((current) => ({ ...current, ...value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const barcode = normalizeBarcode(draft.barcode ?? '');
    if (!draft.title.trim()) {
      setError('Укажите название товара');
      return;
    }
    if (draft.price <= 0) {
      setError('Укажите розничную цену');
      return;
    }
    if (!draft.category_id) {
      setError('Выберите категорию');
      return;
    }
    if (barcode && barcodeExists(barcode, draft.id)) {
      setError('Такой штрих-код уже есть в этом магазине');
      return;
    }

    const stockQuantity = Math.max(0, Math.round(draft.stock_quantity ?? 0));
    const stockCount = draft.sale_unit === 'weight' ? Math.ceil(stockQuantity / 1000) : stockQuantity;
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        sku: draft.sku?.trim() ?? '',
        barcode,
        cost_price: Math.max(0, Math.round(draft.cost_price ?? 0)),
        minimum_stock: Math.max(0, Math.round(draft.minimum_stock ?? 0)),
        stock_quantity: stockQuantity,
        stock_count: stockCount,
        current_stock: stockCount,
        daily_stock: stockCount,
        category_ids: [draft.category_id],
        image_url: draft.image_urls?.[0] ?? '',
        quantity_unit: draft.sale_unit === 'weight' ? 'gram' : 'piece',
        price_basis_quantity: draft.sale_unit === 'weight' ? 1000 : 1,
        minimum_quantity: draft.sale_unit === 'weight' ? Math.max(1, draft.minimum_quantity ?? 100) : 1,
        quantity_step: draft.sale_unit === 'weight' ? Math.max(1, draft.quantity_step ?? 100) : 1,
        unit: draft.sale_unit === 'weight' ? 'кг' : 'шт',
        pricing_type: draft.sale_unit === 'weight' ? 'per_kg' : 'fixed'
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить товар');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="grocery-dialog-backdrop grocery-dialog-backdrop--drawer" role="presentation">
      <section className="grocery-product-drawer" role="dialog" aria-modal="true" aria-labelledby="grocery-product-editor-title">
        <header>
          <div>
            <PackagePlus />
            <div>
              <h2 id="grocery-product-editor-title">{product ? 'Карточка товара' : 'Новый товар'}</h2>
              <p>{product ? 'Измените карточку и цены; остаток — через складские документы' : 'Сканируйте код или заполните карточку вручную'}</p>
            </div>
          </div>
          <button type="button" aria-label="Закрыть карточку товара" onClick={onClose}><X /></button>
        </header>

        <form onSubmit={(event) => void submit(event)}>
          <div className="grocery-product-drawer__body">
            {error && <p className="grocery-form-error">{error}</p>}
            <section className="grocery-editor-scan-row">
              <label>
                Штрих-код
                <input
                  inputMode="numeric"
                  value={draft.barcode ?? ''}
                  onChange={(event) => patch({ barcode: normalizeBarcode(event.target.value) })}
                  placeholder="4601234567890"
                />
              </label>
              <button className="grocery-button grocery-button--secondary" type="button" onClick={onRequestScan}>
                <ScanBarcode />Сканировать
              </button>
            </section>

            <GroceryProductPhotoEditor
              images={draft.image_urls ?? []}
              onChange={(images) => patch({ image_urls: images, image_url: images[0] ?? '' })}
              photoProcessor={photoProcessor}
            />

            <section className="grocery-editor-section">
              <h3>Основное</h3>
              <div className="grocery-form-grid grocery-form-grid--two">
                <label className="grocery-form-grid__wide">Название товара<input required value={draft.title} onChange={(event) => patch({ title: event.target.value.slice(0, 120) })} placeholder="Молоко 3,2% 1 л" /></label>
                <label>Категория<select value={draft.category_id} onChange={(event) => patch({ category_id: event.target.value })}>
                  <option value="">Выберите категорию</option>
                  {categories.filter((category) => category.kind !== 'space').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select></label>
                <label>Артикул / SKU<input value={draft.sku ?? ''} onChange={(event) => patch({ sku: event.target.value.slice(0, 64) })} placeholder="MILK-32-1L" /></label>
                <label className="grocery-form-grid__wide">Описание<textarea value={draft.description} onChange={(event) => patch({ description: event.target.value.slice(0, 500) })} placeholder="Короткое описание для покупателя" /></label>
              </div>
            </section>

            <section className="grocery-editor-section">
              <h3>Цены и учёт</h3>
              <div className="grocery-form-grid grocery-form-grid--two">
                <label>Закупочная цена, ₽<input type="number" min="0" value={draft.cost_price ?? 0} onChange={(event) => patch({ cost_price: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <label>Розничная цена, ₽<input required type="number" min="0" value={draft.price} onChange={(event) => patch({ price: Math.max(0, Number(event.target.value) || 0) })} /></label>
                <div className="grocery-margin-preview"><span>Маржа</span><strong>{margin.amount.toLocaleString('ru-RU')} ₽ · {margin.percent}%</strong></div>
                <label>Тип продажи<select value={draft.sale_unit ?? 'piece'} onChange={(event) => {
                  const saleUnit = event.target.value as Product['sale_unit'];
                  patch({
                    sale_unit: saleUnit,
                    quantity_unit: saleUnit === 'weight' ? 'gram' : 'piece',
                    price_basis_quantity: saleUnit === 'weight' ? 1000 : 1,
                    quantity_step: saleUnit === 'weight' ? 100 : 1,
                    minimum_quantity: saleUnit === 'weight' ? 100 : 1
                  });
                }}><option value="piece">Штучный</option><option value="weight">Весовой</option></select></label>
                <label>
                  {product ? 'Остаток по складу' : 'Начальный остаток'}, {draft.sale_unit === 'weight' ? 'г' : 'шт'}
                  <input
                    type="number"
                    min="0"
                    disabled={Boolean(product)}
                    title={product ? 'Для изменения остатка создайте поступление или другой складской документ' : undefined}
                    value={draft.stock_quantity ?? 0}
                    onChange={(event) => patch({ stock_quantity: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
                <label>Минимальный остаток, {draft.sale_unit === 'weight' ? 'г' : 'шт'}<input type="number" min="0" value={draft.minimum_stock ?? 0} onChange={(event) => patch({ minimum_stock: Math.max(0, Number(event.target.value) || 0) })} /></label>
              </div>
            </section>

            <section className="grocery-editor-section grocery-editor-switches">
              <label><input type="checkbox" checked={!draft.is_hidden} onChange={(event) => patch({ is_hidden: !event.target.checked })} /><span />В продаже</label>
              <label><input type="checkbox" checked={draft.allow_substitution !== false} onChange={(event) => patch({ allow_substitution: event.target.checked })} /><span />Разрешить замену при сборке</label>
            </section>
          </div>

          <footer>
            {product && <button className="grocery-button grocery-button--ghost" type="button" onClick={() => patch({ is_hidden: true })}><Archive />Скрыть</button>}
            <button className="grocery-button grocery-button--secondary" type="button" onClick={onClose}>Отмена</button>
            <button className="grocery-button grocery-button--primary" type="submit" disabled={saving}><Save />{saving ? 'Сохраняем…' : 'Сохранить товар'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
