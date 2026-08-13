import {
  ArrowRight,
  CheckCircle2,
  PackagePlus,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  Truck,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Product } from '../../entities/models';
import type { GroceryReceivingLineInput } from '../../shared/api/groceryInventoryApi';
import { BarcodeCaptureDialog } from './BarcodeCaptureDialog';
import {
  findProductByBarcode,
  normalizeBarcode,
  playBarcodeBeep,
  useHardwareBarcodeScanner
} from './barcodeScanner';
import { formatInventoryQuantity, getProductScanIncrement } from './inventoryModel';

type ReceivingLine = GroceryReceivingLineInput & { product: Product };

const lineFromProduct = (product: Product): ReceivingLine => ({
  product,
  productId: product.id,
  quantity: getProductScanIncrement(product),
  unitCost: Math.max(0, product.cost_price ?? 0),
  unitPrice: Math.max(0, product.price),
  minimumStock: Math.max(0, product.minimum_stock ?? 0)
});

export function GroceryReceivingPage({
  products,
  readOnly,
  autoAddProduct,
  onConsumeAutoAdd,
  onCreateProduct,
  onPost
}: {
  products: Product[];
  readOnly: boolean;
  autoAddProduct: Product | null;
  onConsumeAutoAdd: () => void;
  onCreateProduct: (barcode?: string) => void;
  onPost: (supplierName: string, note: string, lines: GroceryReceivingLineInput[]) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<ReceivingLine[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [note, setNote] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');

  const addProduct = useCallback((product: Product) => {
    if (readOnly) return;
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (!existing) return [...current, lineFromProduct(product)];
      return current.map((line) => line.productId === product.id
        ? { ...line, quantity: line.quantity + getProductScanIncrement(product) }
        : line);
    });
    setQuery('');
    setMessage(`${product.title}: добавлено в поступление`);
  }, [readOnly]);

  const handleBarcode = useCallback((barcode: string) => {
    setScannerOpen(false);
    const product = findProductByBarcode(products, barcode);
    if (!product) {
      playBarcodeBeep('error');
      setMessage(`Штрих‑код ${barcode} не найден. Создайте карточку товара.`);
      onCreateProduct(barcode);
      return;
    }
    playBarcodeBeep();
    addProduct(product);
  }, [addProduct, onCreateProduct, products]);

  useHardwareBarcodeScanner({ enabled: !scannerOpen && !readOnly, onScan: handleBarcode });

  useEffect(() => {
    if (!autoAddProduct) return;
    addProduct(autoAddProduct);
    onConsumeAutoAdd();
  }, [addProduct, autoAddProduct, onConsumeAutoAdd]);

  const searchResults = useMemo(() => normalizedQuery.length < 2 ? [] : products
    .filter((product) => `${product.title} ${product.sku ?? ''} ${product.barcode ?? ''}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery))
    .slice(0, 8), [normalizedQuery, products]);

  const scanFromSearch = () => {
    const barcode = normalizeBarcode(query);
    if (!/^\d{4,64}$/.test(barcode)) return;
    handleBarcode(barcode);
  };
  const totalCost = lines.reduce((sum, line) => sum + line.unitCost * (line.product.sale_unit === 'weight' ? line.quantity / 1000 : line.quantity), 0);
  const unitsCount = lines.reduce((sum, line) => sum + (line.product.sale_unit === 'weight' ? 1 : line.quantity), 0);

  const patchLine = (productId: string, patch: Partial<ReceivingLine>) => {
    setLines((current) => current.map((line) => line.productId === productId ? { ...line, ...patch } : line));
  };

  const post = async () => {
    if (!lines.length || posting || readOnly) return;
    setPosting(true);
    setMessage('');
    try {
      await onPost(supplierName, note, lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        unitPrice: line.unitPrice,
        minimumStock: line.minimumStock
      })));
      setLines([]);
      setSupplierName('');
      setNote('');
      setMessage('Поступление проведено. Остатки обновлены.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось провести поступление');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="grocery-operations-page" data-page="receiving">
      <header className="grocery-page-heading">
        <div>
          <span className="grocery-eyebrow"><Truck />Складской документ</span>
          <h2>Новое поступление</h2>
          <p>Сканируйте товар или выберите его из базы. Повторный скан увеличивает количество.</p>
        </div>
        <button className="grocery-button grocery-button--primary" type="button" disabled={readOnly} onClick={() => setScannerOpen(true)}><ScanBarcode />Сканировать товар</button>
      </header>

      <section className="grocery-receiving-meta">
        <label>Поставщик<input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Например, ООО «Поставщик»" /></label>
        <label>Комментарий<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Номер накладной или примечание" /></label>
      </section>

      <section className="grocery-receiving-search">
        <div className="grocery-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          scanFromSearch();
        }} placeholder="Начните вводить название, артикул или штрих‑код" /></div>
        {searchResults.length > 0 && (
          <div className="grocery-search-results">
            {searchResults.map((product) => (
              <button key={product.id} type="button" disabled={readOnly} onClick={() => addProduct(product)}>
                {product.image_url ? <img src={product.image_url} alt="" /> : <PackagePlus />}
                <span><strong>{product.title}</strong><small>{product.barcode || product.sku || 'Без кода'} · остаток {formatInventoryQuantity(product)}</small></span>
                <Plus />
              </button>
            ))}
          </div>
        )}
        <button className="grocery-inline-create" type="button" disabled={readOnly} onClick={() => onCreateProduct()}><PackagePlus />Товара нет в базе — создать новый</button>
      </section>

      {message && <p className="grocery-message"><CheckCircle2 />{message}<button type="button" aria-label="Закрыть сообщение" onClick={() => setMessage('')}><X /></button></p>}

      <section className="grocery-document-table">
        <div className="grocery-document-table__head"><span>Товар</span><span>Количество</span><span>Закупка</span><span>Продажа</span><span>Мин. остаток</span><span>Сумма</span><span /></div>
        {lines.map((line) => {
          const divisor = line.product.sale_unit === 'weight' ? 1000 : 1;
          return (
            <article key={line.productId}>
              <span className="grocery-product-cell">{line.product.image_url ? <img className="grocery-product-image" src={line.product.image_url} alt="" /> : <PackagePlus className="grocery-product-image grocery-product-image--empty" />}<span><strong>{line.product.title}</strong><small>{line.product.barcode || 'Без штрих‑кода'}</small></span></span>
              <label data-label="Количество"><input type="number" min={getProductScanIncrement(line.product)} step={getProductScanIncrement(line.product)} value={line.quantity} onChange={(event) => patchLine(line.productId, { quantity: Math.max(getProductScanIncrement(line.product), Number(event.target.value) || 0) })} /><small>{line.product.sale_unit === 'weight' ? 'г' : 'шт'}</small></label>
              <label data-label="Закупка"><input type="number" min="0" value={line.unitCost} onChange={(event) => patchLine(line.productId, { unitCost: Math.max(0, Number(event.target.value) || 0) })} /><small>₽</small></label>
              <label data-label="Продажа"><input type="number" min="0" value={line.unitPrice} onChange={(event) => patchLine(line.productId, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} /><small>₽</small></label>
              <label data-label="Мин. остаток"><input type="number" min="0" value={line.minimumStock} onChange={(event) => patchLine(line.productId, { minimumStock: Math.max(0, Number(event.target.value) || 0) })} /><small>{line.product.sale_unit === 'weight' ? 'г' : 'шт'}</small></label>
              <span data-label="Сумма"><strong>{new Intl.NumberFormat('ru-RU').format(Math.round(line.unitCost * line.quantity / divisor))} ₽</strong></span>
              <button className="grocery-remove-line" type="button" aria-label={`Удалить ${line.product.title}`} onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}><Trash2 /></button>
            </article>
          );
        })}
        {!lines.length && <div className="grocery-empty"><ScanBarcode /><h3>Добавьте товары в документ</h3><p>Сканер работает как клавиатура: считайте код и нажмите Enter.</p></div>}
      </section>

      <footer className="grocery-document-total">
        <span><small>Позиций</small><strong>{lines.length}</strong></span>
        <span><small>Единиц</small><strong>{unitsCount}</strong></span>
        <span><small>Сумма закупки</small><strong>{new Intl.NumberFormat('ru-RU').format(Math.round(totalCost))} ₽</strong></span>
        <button className="grocery-button grocery-button--primary" type="button" disabled={readOnly || posting || !lines.length} onClick={() => void post()}>{posting ? 'Проводим…' : 'Провести поступление'}<ArrowRight /></button>
      </footer>

      <BarcodeCaptureDialog open={scannerOpen} title="Добавить в поступление" onClose={() => setScannerOpen(false)} onScan={handleBarcode} />
    </div>
  );
}
