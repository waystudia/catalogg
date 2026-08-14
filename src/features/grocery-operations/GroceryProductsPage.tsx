import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  Image as ImageIcon,
  PackagePlus,
  Pencil,
  ScanBarcode,
  Search,
  Truck
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Category, Product } from '../../entities/models';
import {
  formatInventoryQuantity,
  getProductInventoryQuantity,
  getProductMargin
} from './inventoryModel';
import { BarcodeCaptureDialog } from './BarcodeCaptureDialog';
import { findProductByBarcode } from './barcodeScanner';

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

function ProductImage({ product }: { product: Product }) {
  if (!product.image_url) return <span className="grocery-product-image grocery-product-image--empty"><ImageIcon /></span>;
  return <img className="grocery-product-image" src={product.image_url} alt="" loading="lazy" />;
}

export function GroceryProductsPage({
  products,
  categories,
  readOnly,
  publicUrl,
  onEdit,
  onCreate,
  onReceiving
}: {
  products: Product[];
  categories: Category[];
  readOnly: boolean;
  publicUrl: string;
  onEdit: (product: Product) => void;
  onCreate: (barcode?: string) => void;
  onReceiving: () => void;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const filtered = useMemo(() => products.filter((product) => {
    const searchText = `${product.title} ${product.sku ?? ''} ${product.barcode ?? ''}`.toLocaleLowerCase('ru-RU');
    const quantity = getProductInventoryQuantity(product);
    const minimum = Math.max(0, product.minimum_stock ?? 0);
    const matchesStock = stockFilter === 'all'
      || (stockFilter === 'out' ? quantity <= 0 : quantity > 0 && quantity <= minimum);
    return (!normalizedQuery || searchText.includes(normalizedQuery))
      && (categoryId === 'all' || product.category_id === categoryId)
      && matchesStock;
  }), [categoryId, normalizedQuery, products, stockFilter]);

  const lowCount = products.filter((product) => {
    const quantity = getProductInventoryQuantity(product);
    return quantity > 0 && quantity <= Math.max(0, product.minimum_stock ?? 0);
  }).length;
  const outCount = products.filter((product) => getProductInventoryQuantity(product) <= 0).length;

  const handleBarcode = (barcode: string) => {
    setScannerOpen(false);
    const product = findProductByBarcode(products, barcode);
    if (readOnly) {
      setQuery(barcode);
      return;
    }
    if (product) onEdit(product);
    else onCreate(barcode);
  };

  return (
    <div className="grocery-operations-page" data-page="products">
      <header className="grocery-page-heading">
        <div>
          <span className="grocery-eyebrow"><Boxes />Товарный учёт</span>
          <h2>Товары</h2>
          <p>Каталог магазина, штрих‑коды, цены и фактические остатки в одной таблице.</p>
        </div>
        <div className="grocery-page-actions">
          <a className="grocery-button grocery-button--ghost" href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink />Витрина</a>
          <button className="grocery-button grocery-button--secondary" type="button" onClick={() => setScannerOpen(true)}><ScanBarcode />Сканировать</button>
          <button className="grocery-button grocery-button--secondary" type="button" disabled={readOnly} onClick={onReceiving}><Truck />Поступление</button>
          <button className="grocery-button grocery-button--primary" type="button" disabled={readOnly} onClick={() => onCreate()}><PackagePlus />Новый товар</button>
        </div>
      </header>

      <section className="grocery-summary-grid" aria-label="Сводка товаров">
        <article><span>Всего товаров</span><strong>{products.length}</strong></article>
        <article><span>В продаже</span><strong>{products.filter((product) => !product.is_hidden).length}</strong></article>
        <article data-tone={lowCount ? 'warning' : 'ok'}><span>Заканчиваются</span><strong>{lowCount}</strong></article>
        <article data-tone={outCount ? 'danger' : 'ok'}><span>Нет в наличии</span><strong>{outCount}</strong></article>
      </section>

      <section className="grocery-toolbar">
        <label className="grocery-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, артикул или штрих‑код" /></label>
        <select aria-label="Категория" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="all">Все категории</option>
          {categories.filter((category) => category.kind !== 'space').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <div className="grocery-segmented" aria-label="Фильтр остатков">
          <button type="button" data-active={stockFilter === 'all'} onClick={() => setStockFilter('all')}>Все</button>
          <button type="button" data-active={stockFilter === 'low'} onClick={() => setStockFilter('low')}>Мало</button>
          <button type="button" data-active={stockFilter === 'out'} onClick={() => setStockFilter('out')}>Нет</button>
        </div>
      </section>

      <section className="grocery-products-table" aria-label="Таблица товаров">
        <div className="grocery-products-table__head">
          <span>Товар</span><span>Артикул / штрих‑код</span><span>Остаток</span><span>Закупка</span><span>Продажа</span><span>Маржа</span><span>Статус</span><span />
        </div>
        {filtered.map((product) => {
          const quantity = getProductInventoryQuantity(product);
          const minimum = Math.max(0, product.minimum_stock ?? 0);
          const margin = getProductMargin(product);
          const status = product.is_hidden ? 'hidden' : quantity <= 0 ? 'out' : quantity <= minimum ? 'low' : 'active';
          return (
            <article key={product.id}>
              <span className="grocery-product-cell"><ProductImage product={product} /><span><strong>{product.title}</strong><small>{categoryNames.get(product.category_id) ?? 'Без категории'}</small></span></span>
              <span className="grocery-code-cell" data-label="Артикул / штрих‑код"><strong>{product.sku || 'Без артикула'}</strong><small>{product.barcode || 'Штрих‑код не указан'}</small></span>
              <span className="grocery-product-metric grocery-product-metric--stock" data-label="Остаток"><strong>{formatInventoryQuantity(product)}</strong><small>мин. {formatInventoryQuantity(product, minimum)}</small></span>
              <span className="grocery-product-metric grocery-product-metric--cost" data-label="Закупка"><strong>{money(product.cost_price ?? 0)}</strong></span>
              <span className="grocery-product-metric grocery-product-metric--sale" data-label="Продажа"><strong>{money(product.price)}</strong><small>{product.sale_unit === 'weight' ? 'за 1 кг' : 'за 1 шт'}</small></span>
              <span className="grocery-product-metric grocery-product-metric--margin" data-label="Маржа"><strong>{money(margin.amount)}</strong><small>{margin.percent}%</small></span>
              <span className="grocery-product-status" data-label="Статус"><em className="grocery-status" data-status={status}>{status === 'hidden' ? 'Скрыт' : status === 'out' ? 'Нет в наличии' : status === 'low' ? 'Заканчивается' : 'В продаже'}</em></span>
              <span className="grocery-row-actions"><button type="button" aria-label={`Редактировать ${product.title}`} disabled={readOnly} onClick={() => onEdit(product)}><Pencil /></button></span>
            </article>
          );
        })}
        {!filtered.length && <div className="grocery-empty"><AlertTriangle /><h3>Товары не найдены</h3><p>Измените фильтры или добавьте новый товар.</p></div>}
      </section>

      <footer className="grocery-table-footer">Показано {filtered.length} из {products.length}</footer>
      <BarcodeCaptureDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcode} />
    </div>
  );
}
