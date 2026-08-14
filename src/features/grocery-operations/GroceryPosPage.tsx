import { Banknote, Calculator, CheckCircle2, Minus, PackagePlus, Plus, QrCode, ScanBarcode, Scale, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Product } from '../../entities/models';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import { BarcodeCaptureDialog } from './BarcodeCaptureDialog';
import { findProductByBarcode, normalizeBarcode, playBarcodeBeep, useHardwareBarcodeScanner } from './barcodeScanner';
import { preloadBrowserBarcodeDecoder } from './browserBarcodeDecoder';
import { formatInventoryQuantity, getProductScanIncrement } from './inventoryModel';
import { calculateCashSettlement, getCashQuickAmounts, getGroceryTransferBankLabel, getWeightSaleMinimum, type GroceryPosPayment } from './groceryPosModel';

export type GroceryPosLine = { product: Product; quantity: number };

const lineTotal = (line: GroceryPosLine) => line.product.price * (line.product.sale_unit === 'weight' ? line.quantity / 1000 : line.quantity);
const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽`;

export function GroceryPosPage({ storeName, products, categories, paymentSettings, readOnly, autoAddProduct, onConsumeAutoAdd, onCreateProduct, onSubmit }: { storeName: string; products: Product[]; categories: Category[]; paymentSettings: RestaurantPaymentSettings; readOnly: boolean; autoAddProduct: Product | null; onConsumeAutoAdd: () => void; onCreateProduct: (barcode?: string) => void; onSubmit: (lines: GroceryPosLine[], customerName: string, payment: GroceryPosPayment) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [lines, setLines] = useState<GroceryPosLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [pendingWeightProduct, setPendingWeightProduct] = useState<Product | null>(null);
  const [weightDraft, setWeightDraft] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const transferBankLabel = getGroceryTransferBankLabel(paymentSettings.bankName);

  const addProduct = useCallback(
    (product: Product, quantity = getProductScanIncrement(product)) => {
      if (readOnly) return;
      setLines((current) => {
        const existing = current.find((line) => line.product.id === product.id);
        if (!existing) return [...current, { product, quantity }];
        return current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + quantity } : line));
      });
      setMessage(`${product.title}: добавлено`);
    },
    [readOnly]
  );

  const selectProduct = useCallback(
    (product: Product) => {
      if (readOnly) return;
      if (product.sale_unit === 'weight') {
        setPendingWeightProduct(product);
        setWeightDraft(String(getWeightSaleMinimum(product)));
        return;
      }
      addProduct(product);
    },
    [addProduct, readOnly]
  );

  const handleBarcode = useCallback(
    (barcode: string) => {
      setScannerOpen(false);
      const product = findProductByBarcode(products, barcode);
      if (!product) {
        playBarcodeBeep('error');
        setMessage(`Товар со штрих‑кодом ${barcode} не найден`);
        onCreateProduct(barcode);
        return;
      }
      playBarcodeBeep();
      selectProduct(product);
    },
    [onCreateProduct, products, selectProduct]
  );

  useHardwareBarcodeScanner({
    enabled: !scannerOpen && !pendingWeightProduct && !readOnly,
    onScan: handleBarcode
  });

  useEffect(() => {
    if ('BarcodeDetector' in window) return;
    void preloadBrowserBarcodeDecoder().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!autoAddProduct) return;
    selectProduct(autoAddProduct);
    onConsumeAutoAdd();
  }, [autoAddProduct, onConsumeAutoAdd, selectProduct]);

  useEffect(() => {
    if (!pendingWeightProduct) return;
    window.requestAnimationFrame(() => {
      weightInputRef.current?.focus();
      weightInputRef.current?.select();
    });
  }, [pendingWeightProduct]);

  useEffect(() => {
    if (!paymentSettings.allowCash && paymentMethod === 'cash') setPaymentMethod('transfer');
  }, [paymentMethod, paymentSettings.allowCash]);

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        if (product.is_hidden) return false;
        const matchesCategory = categoryId === 'all' || product.category_id === categoryId;
        const matchesQuery = !normalizedQuery || `${product.title} ${product.sku ?? ''} ${product.barcode ?? ''}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
        return matchesCategory && matchesQuery;
      }),
    [categoryId, normalizedQuery, products]
  );

  const scanFromSearch = () => {
    const barcode = normalizeBarcode(query);
    if (!/^\d{4,64}$/.test(barcode)) return;
    handleBarcode(barcode);
    setQuery('');
  };
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const itemCount = lines.reduce((sum, line) => sum + (line.product.sale_unit === 'weight' ? 1 : line.quantity), 0);
  const cashSettlement = calculateCashSettlement(total, cashReceived);
  const cashQuickAmounts = getCashQuickAmounts(total);
  const cashEntryIsShort = paymentMethod === 'cash' && cashReceived.trim() !== '' && cashSettlement.shortfall > 0;

  const changeQuantity = (product: Product, quantity: number) => {
    const minimum = product.sale_unit === 'weight' ? getWeightSaleMinimum(product) : getProductScanIncrement(product);
    setLines((current) =>
      current.flatMap((line) => {
        if (line.product.id !== product.id) return [line];
        return quantity >= minimum ? [{ ...line, quantity }] : [];
      })
    );
  };

  const submit = async () => {
    if (!lines.length || submitting || readOnly || cashEntryIsShort) return;
    setSubmitting(true);
    setMessage('');
    try {
      await onSubmit(lines, customerName.trim(), {
        method: paymentMethod,
        cashReceived: paymentMethod === 'cash' ? cashSettlement.received : 0,
        cashChange: paymentMethod === 'cash' ? cashSettlement.change : 0
      });
      setLines([]);
      setCustomerName('');
      setCashReceived('');
      setMessage('Заказ создан и передан в общую очередь');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать заказ');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmWeight = () => {
    if (!pendingWeightProduct) return;
    const minimum = getWeightSaleMinimum(pendingWeightProduct);
    const quantity = Math.max(minimum, Math.round(Number(weightDraft.replace(',', '.')) || 0));
    if (quantity < minimum) return;
    addProduct(pendingWeightProduct, quantity);
    setPendingWeightProduct(null);
    setWeightDraft('');
  };

  return (
    <div className="grocery-pos-page">
      <header className="grocery-page-heading grocery-pos-heading">
        <div>
          <span className="grocery-eyebrow">
            <Banknote />
            Касса · {storeName}
          </span>
          <h2>Новая продажа</h2>
          <p>Сканер можно подключить по USB или Bluetooth — отдельная настройка не требуется.</p>
        </div>
        <button className="grocery-button grocery-button--primary" type="button" onClick={() => setScannerOpen(true)} disabled={readOnly}>
          <ScanBarcode />
          Сканировать
        </button>
      </header>

      <div className="grocery-pos-layout">
        <section className="grocery-pos-catalog">
          <div className="grocery-search">
            <Search />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                scanFromSearch();
              }}
              placeholder="Товар, артикул или штрих‑код"
            />
          </div>
          <nav className="grocery-pos-categories" aria-label="Категории товаров">
            <button type="button" data-active={categoryId === 'all'} onClick={() => setCategoryId('all')}>
              Все
            </button>
            {categories
              .filter((category) => category.kind !== 'space')
              .map((category) => (
                <button key={category.id} type="button" data-active={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
                  {category.name}
                </button>
              ))}
          </nav>
          <div className="grocery-pos-products">
            {visibleProducts.map((product) => {
              const selected = lines.find((line) => line.product.id === product.id)?.quantity ?? 0;
              return (
                <button key={product.id} type="button" disabled={readOnly} data-selected={selected > 0} onClick={() => selectProduct(product)}>
                  {product.image_url ? (
                    <img src={product.image_url} alt="" />
                  ) : (
                    <span>
                      <PackagePlus />
                    </span>
                  )}
                  <strong>{product.title}</strong>
                  <small>{formatInventoryQuantity(product)} на складе</small>
                  <b>
                    {money(product.price)}
                    {product.sale_unit === 'weight' ? ' / кг' : ''}
                  </b>
                  {selected > 0 && <em>{product.sale_unit === 'weight' ? `${selected} г` : selected}</em>}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="grocery-pos-cart">
          <header>
            <span>
              <ShoppingCart />
              <strong>Текущий заказ</strong>
            </span>
            <button type="button" disabled={!lines.length} onClick={() => setLines([])}>
              Очистить
            </button>
          </header>
          {message && (
            <p className="grocery-pos-message">
              <CheckCircle2 />
              {message}
            </p>
          )}
          <div className="grocery-pos-cart__lines">
            {lines.map((line) => {
              const step = getProductScanIncrement(line.product);
              return (
                <article key={line.product.id}>
                  <span>
                    <strong>{line.product.title}</strong>
                    <small>
                      {money(line.product.price)}
                      {line.product.sale_unit === 'weight' ? ' / кг' : ''}
                    </small>
                  </span>
                  <div className="grocery-quantity-control">
                    <button type="button" aria-label="Уменьшить" onClick={() => changeQuantity(line.product, line.quantity - step)}>
                      <Minus />
                    </button>
                    <label>
                      <input aria-label={`Количество ${line.product.title}`} type="number" min={step} step={step} value={line.quantity} onChange={(event) => changeQuantity(line.product, Number(event.target.value) || 0)} />
                      <small>{line.product.sale_unit === 'weight' ? 'г' : 'шт'}</small>
                    </label>
                    <button type="button" aria-label="Увеличить" onClick={() => changeQuantity(line.product, line.quantity + step)}>
                      <Plus />
                    </button>
                  </div>
                  <strong>{money(lineTotal(line))}</strong>
                  <button className="grocery-remove-line" type="button" aria-label={`Удалить ${line.product.title}`} onClick={() => setLines((current) => current.filter((item) => item.product.id !== line.product.id))}>
                    <Trash2 />
                  </button>
                </article>
              );
            })}
            {!lines.length && (
              <div className="grocery-empty">
                <ScanBarcode />
                <h3>Заказ пуст</h3>
                <p>Отсканируйте товар или нажмите на карточку слева.</p>
              </div>
            )}
          </div>
          <section className="grocery-pos-customer">
            <label>
              Покупатель (необязательно)
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Гость" />
            </label>
            <div className="grocery-segmented">
              <button type="button" disabled={!paymentSettings.allowCash} data-active={paymentMethod === 'cash'} onClick={() => setPaymentMethod('cash')}>
                Наличные
              </button>
              <button type="button" data-active={paymentMethod === 'transfer'} onClick={() => setPaymentMethod('transfer')}>
                Перевод
              </button>
            </div>
            {paymentMethod === 'cash' ? (
              <section className="grocery-pos-cash-calculator">
                <label>
                  <span>
                    <Calculator />
                    Получено наличными
                  </span>
                  <input aria-label="Получено наличными" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value.replace(/[^\d\s,.]/g, ''))} placeholder={money(total)} />
                </label>
                <div className="grocery-pos-cash-presets">
                  {cashQuickAmounts.map((amount, index) => (
                    <button key={amount} type="button" onClick={() => setCashReceived(String(amount))}>
                      {index === 0 ? 'Без сдачи' : money(amount)}
                    </button>
                  ))}
                </div>
                {cashReceived.trim() === '' ? <small>Введите сумму — касса сразу рассчитает сдачу.</small> : cashEntryIsShort ? <strong data-tone="danger">Не хватает {money(cashSettlement.shortfall)}</strong> : <strong>Сдача {money(cashSettlement.change)}</strong>}
              </section>
            ) : (
              <section className="grocery-pos-transfer">
                {paymentSettings.qrUrl ? (
                  <img src={paymentSettings.qrUrl} alt="QR-код для перевода магазину" />
                ) : (
                  <span className="grocery-pos-transfer__empty" role="img" aria-label="QR-код не добавлен">
                    <QrCode />
                  </span>
                )}
                <div>
                  <strong>{paymentSettings.displayName || 'Получатель не указан'}</strong>
                  {!paymentSettings.qrUrl && <small className="grocery-pos-transfer__hint">QR-код не добавлен — загрузите его в «Настройки → Платежи».</small>}
                  {transferBankLabel && <small>{transferBankLabel}</small>}
                  {paymentSettings.transferNumber && <b>{paymentSettings.transferNumber}</b>}
                </div>
              </section>
            )}
          </section>
          <footer>
            <span>
              <small>{itemCount} поз.</small>
              <strong>{money(total)}</strong>
            </span>
            <button className="grocery-button grocery-button--primary" type="button" disabled={readOnly || submitting || !lines.length || cashEntryIsShort} onClick={() => void submit()}>
              {submitting ? 'Создаём…' : 'Создать заказ'}
            </button>
          </footer>
        </aside>
      </div>

      <BarcodeCaptureDialog open={scannerOpen} autoStartCamera title="Сканировать на кассе" onClose={() => setScannerOpen(false)} onScan={handleBarcode} />
      {pendingWeightProduct && (
        <div
          className="grocery-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPendingWeightProduct(null);
          }}
        >
          <section className="grocery-dialog grocery-weight-dialog" role="dialog" aria-modal="true" aria-labelledby="grocery-weight-title">
            <header>
              <div>
                <Scale />
                <div>
                  <h2 id="grocery-weight-title">Введите вес</h2>
                  <p>
                    {pendingWeightProduct.title} · {money(pendingWeightProduct.price)} / кг
                  </p>
                </div>
              </div>
              <button type="button" aria-label="Закрыть ввод веса" onClick={() => setPendingWeightProduct(null)}>
                <X />
              </button>
            </header>
            <label>
              Вес товара
              <div>
                <input ref={weightInputRef} aria-label={`Вес ${pendingWeightProduct.title} в граммах`} type="number" inputMode="decimal" min={getWeightSaleMinimum(pendingWeightProduct)} step={pendingWeightProduct.quantity_step ?? 100} value={weightDraft} onChange={(event) => setWeightDraft(event.target.value)} />
                <span>г</span>
              </div>
            </label>
            <div className="grocery-weight-dialog__presets">
              {[100, 250, 500, 1000].filter((grams) => grams >= getWeightSaleMinimum(pendingWeightProduct)).map((grams) => (
                <button key={grams} type="button" onClick={() => setWeightDraft(String(grams))}>
                  {grams === 1000 ? '1 кг' : `${grams} г`}
                </button>
              ))}
            </div>
            <div className="grocery-weight-dialog__total">
              <span>Стоимость</span>
              <strong>{money((pendingWeightProduct.price * (Number(weightDraft) || 0)) / 1000)}</strong>
            </div>
            <button className="grocery-button grocery-button--primary" type="button" disabled={(Number(weightDraft) || 0) < getWeightSaleMinimum(pendingWeightProduct)} onClick={confirmWeight}>
              Добавить в заказ
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
