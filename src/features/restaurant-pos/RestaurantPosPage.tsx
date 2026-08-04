import { ArrowLeft, Info, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Cabin, Category, Product } from '../../entities/models';
import type { RestaurantModuleAccessMode } from '../platform-admin-modules/restaurantModuleAccess';
import {
  getActiveRestaurantCabins,
  getActiveRestaurantTables,
  parseCabinMeta
} from '../restaurant-settings/catalogAdminModel';
import {
  addPosCartItem,
  changePosCartItemQuantity,
  getPosCartItemsCount,
  getPosCartTotal,
  type RestaurantPosCartItem
} from './restaurantPosCart';
import './restaurant-pos.css';

export type RestaurantPosOrderDraft = {
  items: RestaurantPosCartItem[];
  customerName: string;
  customerPhone: string;
  comment: string;
  tableLabel: string;
  cabinPrice: number;
  deliveryAddress: string;
  fulfillmentType: 'hall' | 'takeaway' | 'delivery';
  paymentMethod: 'cash' | 'transfer';
  cashReceived: number;
  cashChange: number;
};

type RestaurantPosPageProps = {
  restaurantName: string;
  categories: Category[];
  cabins?: Cabin[];
  products: Product[];
  accessMode: RestaurantModuleAccessMode;
  nextGuestNumber?: number;
  onSubmitOrder?: (draft: RestaurantPosOrderDraft) => Promise<void>;
};

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const longPressDuration = 550;
const getTableInputValue = (title: string) => title.replace(/^Стол(?:ик)?\s*/i, '').trim() || title;

const fulfillmentOptions = [
  { value: 'hall', label: 'В зале' },
  { value: 'takeaway', label: 'На вынос' },
  { value: 'delivery', label: 'Доставка' }
] as const;

const paymentOptions = [
  { value: 'cash', label: 'Наличные' },
  { value: 'transfer', label: 'Перевод' }
] as const;

const cashKeypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;

function PosImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!src || failedSource === src) {
    return (
      <span className={className} role="img" aria-label={alt || 'Фото блюда'}>
        <ShoppingBag aria-hidden="true" />
      </span>
    );
  }
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSource(src)} />;
}

function PosProductCard({
  product,
  quantity,
  readOnly,
  onAdd,
  onShowDetails
}: {
  product: Product;
  quantity: number;
  readOnly: boolean;
  onAdd: () => void;
  onShowDetails: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const startLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (readOnly || (event.pointerType === 'mouse' && event.button !== 0)) return;
    clearLongPress();
    suppressClick.current = false;
    longPressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      onShowDetails();
      longPressTimer.current = null;
    }, longPressDuration);
  };

  return (
    <button
      className="restaurant-pos-product-card"
      type="button"
      aria-label={`Добавить ${product.title}`}
      aria-haspopup="dialog"
      data-selected={quantity > 0}
      disabled={readOnly}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!readOnly) onShowDetails();
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onAdd();
      }}
      title="Нажмите, чтобы добавить. Удерживайте, чтобы посмотреть информацию"
    >
      <PosImage src={product.image_url} alt="" className="restaurant-pos-product-card__image" />
      <strong>{product.title}</strong>
      {quantity > 0 && (
        <span
          className="restaurant-pos-product-card__quantity"
          aria-label={`${product.title} в заказе: ${quantity}`}
        >
          {quantity}
        </span>
      )}
    </button>
  );
}

export function RestaurantPosPage({
  restaurantName,
  categories,
  cabins = [],
  products,
  accessMode,
  nextGuestNumber = 1,
  onSubmitOrder
}: RestaurantPosPageProps) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [items, setItems] = useState<RestaurantPosCartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [comment, setComment] = useState('');
  const [seatingMode, setSeatingMode] = useState<'table' | 'cabin'>('table');
  const [tableNumber, setTableNumber] = useState('');
  const [selectedCabinId, setSelectedCabinId] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<RestaurantPosOrderDraft['fulfillmentType']>('hall');
  const [paymentMethod, setPaymentMethod] = useState<RestaurantPosOrderDraft['paymentMethod']>('cash');
  const [cashInput, setCashInput] = useState('');
  const [showCashChange, setShowCashChange] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const guestNumberRef = useRef(Math.max(1, nextGuestNumber));
  const readOnly = accessMode === 'read_only';
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const showCategories = categoryId === null && !normalizedQuery;

  const activeCabins = useMemo(
    () => getActiveRestaurantCabins(cabins),
    [cabins]
  );
  const activeTables = useMemo(
    () => getActiveRestaurantTables(cabins),
    [cabins]
  );
  const selectedCabin = activeCabins.find((cabin) => cabin.id === selectedCabinId);
  const cabinPrice = selectedCabin ? parseCabinMeta(selectedCabin.feature).price : 0;
  const selectedPlaceLabel = seatingMode === 'cabin'
    ? selectedCabin?.title ?? ''
    : tableNumber.trim() ? `Стол ${tableNumber.trim()}` : '';

  const visibleProducts = useMemo(() => products.filter((product) => {
    if (product.is_hidden) return false;
    const matchesQuery = !normalizedQuery || product.title.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
    const matchesCategory = categoryId === null || categoryId === 'all' || product.category_id === categoryId;
    return matchesQuery && matchesCategory;
  }), [categoryId, normalizedQuery, products]);
  const productQuantities = useMemo(
    () => new Map(items.map((item) => [item.productId, item.quantity])),
    [items]
  );

  const total = getPosCartTotal(items);
  const cashReceived = Number.parseInt(cashInput, 10) || 0;
  const cashChange = Math.max(0, cashReceived - total);
  const cashShortfall = Math.max(0, total - cashReceived);
  const itemsCount = getPosCartItemsCount(items);
  const requiresDeliveryAddress = fulfillmentType === 'delivery' && !deliveryAddress.trim();
  const canSubmit = !readOnly && !isSubmitting && items.length > 0 && !requiresDeliveryAddress;

  useEffect(() => {
    guestNumberRef.current = Math.max(guestNumberRef.current, nextGuestNumber);
  }, [nextGuestNumber]);

  const addProduct = (product: Product) => {
    if (readOnly) return;
    setItems((current) => addPosCartItem(current, {
      productId: product.id,
      title: product.title,
      unitPrice: product.price,
      quantity: 1
    }));
    setMessage('');
  };

  const submitOrder = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      await onSubmitOrder?.({
        items,
        customerName: customerName.trim() || `Гость №${guestNumberRef.current}`,
        customerPhone: customerPhone.trim(),
        comment: comment.trim(),
        tableLabel: fulfillmentType === 'hall' ? selectedPlaceLabel : '',
        cabinPrice: fulfillmentType === 'hall' && seatingMode === 'cabin' ? cabinPrice : 0,
        deliveryAddress: deliveryAddress.trim(),
        fulfillmentType,
        paymentMethod,
        cashReceived: paymentMethod === 'cash' ? cashReceived : 0,
        cashChange: paymentMethod === 'cash' ? cashChange : 0
      });
      if (!customerName.trim()) guestNumberRef.current += 1;
      setItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setComment('');
      setCashInput('');
      setShowCashChange(false);
      setMessage('Заказ оформлен и передан в общий список заказов');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось оформить заказ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="restaurant-pos-page">
      <header className="restaurant-pos-page__header">
        <div>
          <h2>Касса — Новый заказ</h2>
          <p>Блюда из текущего каталога «{restaurantName}»</p>
        </div>
        {readOnly && <strong>Подписка закончилась — доступен только просмотр</strong>}
      </header>

      <div className="restaurant-pos-layout">
        <section className="restaurant-pos-catalog" aria-label="Каталог блюд">
          <div className="restaurant-pos-catalog__toolbar">
            <button
              className="restaurant-pos-all-products"
              type="button"
              aria-label={showCategories ? 'Показать все блюда' : 'Вернуться к категориям'}
              data-active={categoryId === 'all'}
              onClick={() => {
                if (showCategories) {
                  setCategoryId('all');
                  return;
                }
                setCategoryId(null);
                setQuery('');
              }}
            >
              {!showCategories && <ArrowLeft />}
              {showCategories ? 'Все блюда' : 'Категории'}
            </button>
            <label className="restaurant-pos-search">
              <Search />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск блюда" />
            </label>
          </div>

          {showCategories && (
            <nav className="restaurant-pos-categories" aria-label="Категории POS">
              {categories.filter((category) => category.kind !== 'space').map((category) => (
                <button
                  type="button"
                  aria-label={`Открыть категорию ${category.name}`}
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.image
                    ? <PosImage src={category.image} alt={category.name} />
                    : <span aria-hidden="true"><ShoppingBag /></span>}
                  <strong>{category.name}</strong>
                </button>
              ))}
            </nav>
          )}

          {!showCategories && (
            <div className="restaurant-pos-products">
              {visibleProducts.map((product) => (
                <PosProductCard
                  key={product.id}
                  product={product}
                  quantity={productQuantities.get(product.id) ?? 0}
                  readOnly={readOnly}
                  onAdd={() => addProduct(product)}
                  onShowDetails={() => setDetailsProduct(product)}
                />
              ))}
              {visibleProducts.length === 0 && <p className="restaurant-pos-products__empty">Блюда не найдены</p>}
            </div>
          )}
        </section>

        <aside className="restaurant-pos-order" aria-label="Текущий заказ">
          <header>
            <div><h3>Текущий заказ</h3><small>{itemsCount} позиции</small></div>
            <button type="button" aria-label="Очистить заказ" disabled={readOnly || items.length === 0} onClick={() => setItems([])}><Trash2 /></button>
          </header>

          <div className="restaurant-pos-order__items">
            {items.map((item) => (
              <article key={item.productId}>
                <div><strong>{item.title}</strong><small>{formatPrice(item.unitPrice)} × {item.quantity}</small></div>
                <div>
                  <button type="button" aria-label={`Уменьшить ${item.title}`} disabled={readOnly} onClick={() => setItems((current) => changePosCartItemQuantity(current, item.productId, -1))}><Minus /></button>
                  <span>{item.quantity}</span>
                  <button type="button" aria-label={`Увеличить ${item.title}`} disabled={readOnly} onClick={() => setItems((current) => changePosCartItemQuantity(current, item.productId, 1))}><Plus /></button>
                </div>
                <b>{formatPrice(item.unitPrice * item.quantity)}</b>
              </article>
            ))}
            {items.length === 0 && <p>Добавьте блюда из каталога слева</p>}
          </div>

          <section className="restaurant-pos-customer">
            <h3>Гость (клиент)</h3>
            <div>
              <label>Имя<input aria-label="Имя гостя" value={customerName} onChange={(event) => setCustomerName(event.target.value)} disabled={readOnly} /></label>
              <label>Телефон<input aria-label="Телефон гостя" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} disabled={readOnly} /></label>
            </div>
            <div className="restaurant-pos-choice">
              {fulfillmentOptions.map((option) => (
                <button type="button" key={option.value} data-active={fulfillmentType === option.value} disabled={readOnly} onClick={() => setFulfillmentType(option.value)}>{option.label}</button>
              ))}
            </div>

            {fulfillmentType === 'hall' && (
              <div className="restaurant-pos-seating">
                {activeCabins.length > 0 && (
                  <div className="restaurant-pos-choice restaurant-pos-seating__mode">
                    <button type="button" data-active={seatingMode === 'table'} disabled={readOnly} onClick={() => setSeatingMode('table')}>Столик</button>
                    <button type="button" data-active={seatingMode === 'cabin'} disabled={readOnly} onClick={() => setSeatingMode('cabin')}>Кабинка</button>
                  </div>
                )}

                {seatingMode === 'table' && (
                  <>
                    <label>Номер столика<input aria-label="Номер столика" inputMode="numeric" value={tableNumber} onChange={(event) => setTableNumber(event.target.value.replace(/[^0-9A-Za-zА-Яа-яЁё-]/g, ''))} disabled={readOnly} /></label>
                    <div className="restaurant-pos-table-grid" aria-label="Быстрый выбор столика">
                      {activeTables.map((table) => {
                        const value = getTableInputValue(table.title);
                        return (
                          <button type="button" key={table.id} data-active={tableNumber === value} disabled={readOnly} onClick={() => setTableNumber(value)}>{table.title}</button>
                        );
                      })}
                    </div>
                  </>
                )}

                {seatingMode === 'cabin' && (
                  <div className="restaurant-pos-cabin-grid">
                    {activeCabins.map((cabin) => {
                      const meta = parseCabinMeta(cabin.feature);
                      return (
                        <button
                          type="button"
                          aria-label={`Выбрать ${cabin.title}`}
                          key={cabin.id}
                          data-active={selectedCabinId === cabin.id}
                          disabled={readOnly}
                          onClick={() => setSelectedCabinId(cabin.id)}
                        >
                          <strong>{cabin.title}</strong>
                          <small>{cabin.capacity}</small>
                          {meta.price > 0 && <b>{formatPrice(meta.price)}</b>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedCabin && seatingMode === 'cabin' && (
                  <p className="restaurant-pos-selected-place">
                    {selectedCabin.title}{cabinPrice > 0 ? ` · ${formatPrice(cabinPrice)}` : ' · бесплатно'}
                  </p>
                )}
              </div>
            )}

            {fulfillmentType === 'delivery' && <label>Адрес доставки<input aria-label="Адрес доставки" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} disabled={readOnly} /></label>}
            <label>Комментарий<textarea aria-label="Комментарий к заказу" value={comment} onChange={(event) => setComment(event.target.value)} disabled={readOnly} /></label>
          </section>

          <section className="restaurant-pos-payment">
            <h3>Способ оплаты</h3>
            <div className="restaurant-pos-choice">
              {paymentOptions.map((option) => (
                <button type="button" key={option.value} data-active={paymentMethod === option.value} disabled={readOnly} onClick={() => setPaymentMethod(option.value)}>{option.label}</button>
              ))}
            </div>
            {paymentMethod === 'cash' && (
              <section className="restaurant-pos-cash" aria-label="Расчёт сдачи">
                <div className="restaurant-pos-cash__display">
                  <span>Получено: {formatPrice(cashReceived)}</span>
                  {showCashChange && (
                    <strong data-tone={cashShortfall > 0 ? 'shortfall' : 'change'}>
                      {cashShortfall > 0 ? `Не хватает: ${formatPrice(cashShortfall)}` : `Сдача: ${formatPrice(cashChange)}`}
                    </strong>
                  )}
                </div>
                <div className="restaurant-pos-cash__keypad">
                  {cashKeypad.map((key) => (
                    <button
                      type="button"
                      key={key}
                      disabled={readOnly}
                      onClick={() => {
                        setCashInput((current) => `${current}${key}`.replace(/^0+(?=\d)/, '').slice(0, 9));
                        setShowCashChange(false);
                      }}
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Удалить цифру"
                    disabled={readOnly || !cashInput}
                    onClick={() => {
                      setCashInput((current) => current.slice(0, -1));
                      setShowCashChange(false);
                    }}
                  >
                    ⌫
                  </button>
                  <button
                    className="restaurant-pos-cash__clear"
                    type="button"
                    disabled={readOnly || !cashInput}
                    onClick={() => {
                      setCashInput('');
                      setShowCashChange(false);
                    }}
                  >
                    Очистить
                  </button>
                  <button
                    className="restaurant-pos-cash__change"
                    type="button"
                    disabled={readOnly || cashReceived <= 0}
                    onClick={() => setShowCashChange(true)}
                  >
                    Сдача
                  </button>
                </div>
              </section>
            )}
          </section>

          <footer>
            <div><span>Итого</span><strong>{formatPrice(total)}</strong></div>
            <button type="button" disabled={!canSubmit} onClick={() => void submitOrder()}>{isSubmitting ? 'Оформляем…' : 'Оформить заказ'}</button>
            {message && <p role="status">{message}</p>}
          </footer>
        </aside>
      </div>

      {detailsProduct && (
        <div className="restaurant-pos-product-modal" onPointerDown={(event) => {
          if (event.currentTarget === event.target) setDetailsProduct(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="restaurant-pos-product-title">
            <button type="button" aria-label="Закрыть информацию о блюде" onClick={() => setDetailsProduct(null)}><X /></button>
            <PosImage src={detailsProduct.image_url} alt={detailsProduct.title} className="restaurant-pos-product-modal__image" />
            <div>
              <span><Info /> Информация о блюде</span>
              <h3 id="restaurant-pos-product-title">{detailsProduct.title}</h3>
              <p>{detailsProduct.description || detailsProduct.ingredients || 'Описание пока не добавлено'}</p>
              <dl>
                <div><dt>Вес</dt><dd>{detailsProduct.weight || 'Порция'}</dd></div>
                <div><dt>Цена</dt><dd>{formatPrice(detailsProduct.price)}</dd></div>
              </dl>
              <button type="button" disabled={readOnly} onClick={() => {
                addProduct(detailsProduct);
                setDetailsProduct(null);
              }}>Добавить в заказ</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
