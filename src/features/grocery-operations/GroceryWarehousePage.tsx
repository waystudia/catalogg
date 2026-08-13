import { AlertTriangle, ArrowDownToLine, ClipboardList, PackageCheck, ScanBarcode, Search, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Product } from '../../entities/models';
import type { GroceryInventoryMovement } from '../../shared/api/groceryInventoryApi';
import { BarcodeCaptureDialog } from './BarcodeCaptureDialog';
import { findProductByBarcode } from './barcodeScanner';
import { formatInventoryQuantity, getProductInventoryQuantity } from './inventoryModel';

const documentNames: Record<GroceryInventoryMovement['documentType'], string> = {
  receiving: 'Поступление',
  writeoff: 'Списание',
  inventory: 'Инвентаризация',
  pos_sale: 'Продажа на кассе'
};

export function GroceryWarehousePage({
  products,
  movements,
  readOnly,
  onReceiving,
  onEditProduct
}: {
  products: Product[];
  movements: GroceryInventoryMovement[];
  readOnly: boolean;
  onReceiving: () => void;
  onEditProduct: (product: Product) => void;
}) {
  const [tab, setTab] = useState<'balances' | 'movements'>('balances');
  const [query, setQuery] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const filteredProducts = useMemo(() => products.filter((product) =>
    !normalizedQuery || `${product.title} ${product.sku ?? ''} ${product.barcode ?? ''}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery)
  ), [normalizedQuery, products]);
  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.title])), [products]);
  const stockValue = products.reduce((sum, product) => sum + (product.cost_price ?? 0) * (product.sale_unit === 'weight' ? getProductInventoryQuantity(product) / 1000 : getProductInventoryQuantity(product)), 0);
  const lowCount = products.filter((product) => getProductInventoryQuantity(product) <= Math.max(0, product.minimum_stock ?? 0)).length;

  const handleBarcode = (barcode: string) => {
    setScannerOpen(false);
    const product = findProductByBarcode(products, barcode);
    if (product && !readOnly) onEditProduct(product);
    else if (product) setQuery(product.barcode || product.title);
    else setQuery(barcode);
  };

  return (
    <div className="grocery-operations-page" data-page="warehouse">
      <header className="grocery-page-heading">
        <div>
          <span className="grocery-eyebrow"><PackageCheck />Учёт магазина</span>
          <h2>Склад</h2>
          <p>Остатки считаются в штуках или граммах и меняются документами.</p>
        </div>
        <div className="grocery-page-actions">
          <button className="grocery-button grocery-button--secondary" type="button" onClick={() => setScannerOpen(true)}><ScanBarcode />Найти сканером</button>
          <button className="grocery-button grocery-button--primary" type="button" disabled={readOnly} onClick={onReceiving}><Truck />Новое поступление</button>
        </div>
      </header>

      <section className="grocery-summary-grid">
        <article><span>Позиций на складе</span><strong>{products.filter((product) => getProductInventoryQuantity(product) > 0).length}</strong></article>
        <article><span>Себестоимость запасов</span><strong>{new Intl.NumberFormat('ru-RU').format(Math.round(stockValue))} ₽</strong></article>
        <article data-tone={lowCount ? 'warning' : 'ok'}><span>Требуют внимания</span><strong>{lowCount}</strong></article>
        <article><span>Движений</span><strong>{movements.length}</strong></article>
      </section>

      <nav className="grocery-tabs" aria-label="Разделы склада">
        <button type="button" data-active={tab === 'balances'} onClick={() => setTab('balances')}>Остатки</button>
        <button type="button" data-active={tab === 'movements'} onClick={() => setTab('movements')}>Движения</button>
      </nav>

      {tab === 'balances' ? (
        <>
          <section className="grocery-toolbar"><label className="grocery-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, артикул или штрих‑код" /></label></section>
          <section className="grocery-products-table grocery-warehouse-table">
            <div className="grocery-products-table__head"><span>Товар</span><span>Штрих‑код</span><span>Факт</span><span>Минимум</span><span>Закупка</span><span>Сумма</span><span>Состояние</span><span /></div>
            {filteredProducts.map((product) => {
              const quantity = getProductInventoryQuantity(product);
              const minimum = Math.max(0, product.minimum_stock ?? 0);
              const value = (product.cost_price ?? 0) * (product.sale_unit === 'weight' ? quantity / 1000 : quantity);
              const low = quantity <= minimum;
              return (
                <article key={product.id}>
                  <span className="grocery-product-cell">{product.image_url ? <img className="grocery-product-image" src={product.image_url} alt="" /> : <PackageCheck className="grocery-product-image grocery-product-image--empty" />}<span><strong>{product.title}</strong><small>{product.sku || 'Без артикула'}</small></span></span>
                  <span data-label="Штрих‑код"><strong>{product.barcode || '—'}</strong></span>
                  <span data-label="Факт"><strong>{formatInventoryQuantity(product)}</strong></span>
                  <span data-label="Минимум"><strong>{formatInventoryQuantity(product, minimum)}</strong></span>
                  <span data-label="Закупка"><strong>{new Intl.NumberFormat('ru-RU').format(product.cost_price ?? 0)} ₽</strong></span>
                  <span data-label="Сумма"><strong>{new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽</strong></span>
                  <span data-label="Состояние"><em className="grocery-status" data-status={quantity <= 0 ? 'out' : low ? 'low' : 'active'}>{quantity <= 0 ? 'Нет' : low ? 'Мало' : 'В норме'}</em></span>
                  <button className="grocery-row-edit" type="button" onClick={() => onEditProduct(product)}>Открыть</button>
                </article>
              );
            })}
          </section>
        </>
      ) : (
        <section className="grocery-movements-list">
          {movements.map((movement) => (
            <article key={movement.id}>
              <span className="grocery-movement-icon"><ArrowDownToLine /></span>
              <span><strong>{documentNames[movement.documentType]}</strong><small>{new Date(movement.createdAt).toLocaleString('ru-RU')} · {movement.supplierName || 'Без поставщика'}</small></span>
              <span><strong>{productNames.get(movement.productId) ?? 'Товар'}</strong><small>{movement.note || 'Без комментария'}</small></span>
              <span data-tone={movement.quantityDelta > 0 ? 'plus' : 'minus'}>{movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}</span>
              <span>{movement.stockBefore} → {movement.stockAfter}</span>
            </article>
          ))}
          {!movements.length && <div className="grocery-empty"><ClipboardList /><h3>Движений пока нет</h3><p>После проведения поступления здесь появится история.</p></div>}
        </section>
      )}

      {lowCount > 0 && <aside className="grocery-attention"><AlertTriangle /><span><strong>Нужно пополнить {lowCount} позиций</strong><small>Сформируйте поступление и отсканируйте фактически принятые товары.</small></span><button type="button" disabled={readOnly} onClick={onReceiving}>Перейти к поступлению</button></aside>}
      <BarcodeCaptureDialog open={scannerOpen} title="Найти товар на складе" onClose={() => setScannerOpen(false)} onScan={handleBarcode} />
    </div>
  );
}
