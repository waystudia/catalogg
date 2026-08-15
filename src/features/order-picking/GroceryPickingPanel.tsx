import { Check, MessageCircle, Package, Replace, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Product } from '../../entities/models';
import type { RestaurantOrderItem } from '../../shared/api/restaurantOrdersApi';
import {
  markCatalogOrderItemPicked,
  proposeCatalogOrderSubstitution
} from '../../shared/api/orderConversationApi';
import './grocery-picking.css';

const stateLabels: Record<NonNullable<RestaurantOrderItem['fulfillmentState']>, string> = {
  pending: 'Ожидает сборки',
  picked: 'Собрано',
  unavailable: 'Нет в наличии',
  substitution_pending: 'Ждём решения клиента',
  substituted: 'Заменено',
  removed: 'Убрано из заказа'
};

const displayQuantity = (item: RestaurantOrderItem, fulfilled = false) => {
  const value = fulfilled ? item.fulfilledQuantity ?? 0 : item.requestedQuantity ?? item.quantity;
  if (item.quantityUnit === 'gram') return `${value} г`;
  if (item.quantityUnit === 'milliliter') return `${value} мл`;
  return `${value} шт.`;
};

export function GroceryPickingPanel({
  items,
  products,
  canPick,
  showDisabledNotice = !canPick,
  onChanged,
  onContactClient
}: {
  items: RestaurantOrderItem[];
  products: Product[];
  canPick: boolean;
  showDisabledNotice?: boolean;
  onChanged?: () => void;
  onContactClient?: () => void;
}) {
  const availableProducts = useMemo(
    () => products.filter((product) => !product.is_hidden && (product.is_unlimited || product.stock_count > 0)),
    [products]
  );
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [replacementByItem, setReplacementByItem] = useState<Record<string, string>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [replacementItemId, setReplacementItemId] = useState<string | null>(null);

  const picked = async (item: RestaurantOrderItem) => {
    if (busyItemId) return;
    const fulfilledQuantity = item.saleUnit === 'weight'
      ? Number(weights[item.id] || item.requestedQuantity || item.quantity)
      : undefined;
    if (fulfilledQuantity !== undefined && (!Number.isInteger(fulfilledQuantity) || fulfilledQuantity <= 0)) {
      toast.error('Укажите фактический вес целым числом граммов');
      return;
    }
    setBusyItemId(item.id);
    try {
      await markCatalogOrderItemPicked(item.id, fulfilledQuantity);
      toast.success(`${item.title}: собрано`);
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось отметить товар');
    } finally {
      setBusyItemId(null);
    }
  };

  const propose = async (item: RestaurantOrderItem) => {
    if (busyItemId) return;
    const originalProduct = products.find((product) => product.id === item.productId);
    const candidates = availableProducts.filter((product) => (
      product.id !== item.productId
      && (!originalProduct || product.category_id === originalProduct.category_id)
    ));
    const proposedProductId = replacementByItem[item.id] || candidates[0]?.id;
    const product = candidates.find((candidate) => candidate.id === proposedProductId);
    if (!product) {
      toast.error('В каталоге нет доступного товара для замены');
      return;
    }
    setBusyItemId(item.id);
    try {
      await proposeCatalogOrderSubstitution({
        orderItemId: item.id,
        proposedProductId: product.id,
        proposedQuantity: product.minimum_quantity,
        note: `Предлагаем заменить на «${product.title}»`
      });
      toast.success('Предложение отправлено клиенту');
      setReplacementItemId(null);
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось предложить замену');
    } finally {
      setBusyItemId(null);
    }
  };

  const replacementItem = items.find((item) => item.id === replacementItemId) ?? null;
  const replacementOriginalProduct = replacementItem
    ? products.find((product) => product.id === replacementItem.productId)
    : null;
  const replacementCandidates = replacementItem
    ? availableProducts.filter((product) => (
        product.id !== replacementItem.productId
        && (!replacementOriginalProduct || product.category_id === replacementOriginalProduct.category_id)
      )).slice(0, 8)
    : [];

  return (
    <section className="grocery-picking" aria-label="Сборка продуктового заказа">
      {showDisabledNotice && <p className="grocery-picking__notice">Сначала примите назначенный заказ в работу.</p>}

      <div className="grocery-picking__lines">
        {items.map((item) => {
          const state = item.fulfillmentState ?? 'pending';
          const product = products.find((candidate) => candidate.id === item.productId);
          const candidates = availableProducts.filter((candidate) => (
            candidate.id !== item.productId
            && (!product || candidate.category_id === product.category_id)
          ));
          const resolved = ['picked', 'substitution_pending', 'substituted', 'removed'].includes(state);
          const partialScan = state === 'pending'
            && item.saleUnit !== 'weight'
            && (item.fulfilledQuantity ?? 0) > 0
            ? `Сканировано ${item.fulfilledQuantity} / ${item.requestedQuantity ?? item.quantity}`
            : '';
          return (
            <article key={item.id} data-state={state}>
              <div className="grocery-picking__photo">
                {product?.image_url ? <img src={product.image_url} alt={item.title} /> : <Package aria-hidden="true" />}
              </div>
              <div className="grocery-picking__identity">
                <strong>{item.title}</strong>
                <small>Заказано: {displayQuantity(item)}</small>
              </div>
              <div className="grocery-picking__quantity">
                <strong>{displayQuantity(item)}</strong>
                <small>{new Intl.NumberFormat('ru-RU').format(item.lineTotal)} ₽</small>
              </div>
              <span className="grocery-picking__state">{partialScan || stateLabels[state]}</span>
              {!resolved && item.saleUnit === 'weight' && (
                <label className="grocery-picking__weight">
                  Фактический вес, г
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={weights[item.id] ?? String(item.requestedQuantity ?? item.quantity)}
                    onChange={(event) => setWeights((current) => ({ ...current, [item.id]: event.target.value }))}
                  />
                </label>
              )}
              {!resolved && (
                <div className="grocery-picking__actions">
                  <button type="button" aria-label={`Собран ${item.title}`} disabled={!canPick || busyItemId === item.id} onClick={() => void picked(item)}>
                    <Check /> Собран
                  </button>
                  <button type="button" aria-label={`Заменить ${item.title}`} disabled={!canPick || busyItemId === item.id || candidates.length === 0} onClick={() => setReplacementItemId(item.id)}>
                    Заменить
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {replacementItem && (
        <div className="grocery-replacement-sheet" role="dialog" aria-modal="true" aria-label="Товар отсутствует">
          <button className="grocery-replacement-sheet__backdrop" type="button" aria-label="Закрыть окно замены" onClick={() => setReplacementItemId(null)} />
          <section>
            <header>
              <div><strong>Товар отсутствует</strong><span>Текущий товар: {replacementItem.title}</span></div>
              <button type="button" aria-label="Закрыть замену" onClick={() => setReplacementItemId(null)}><X /></button>
            </header>
            {replacementCandidates.length > 0 && (
              <label>
                Подходящая замена
                <select
                  aria-label="Предложить замену"
                  value={replacementByItem[replacementItem.id] ?? replacementCandidates[0].id}
                  onChange={(event) => setReplacementByItem((current) => ({ ...current, [replacementItem.id]: event.target.value }))}
                >
                  {replacementCandidates.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                </select>
              </label>
            )}
            <div className="grocery-replacement-sheet__actions">
              <button type="button" disabled={busyItemId === replacementItem.id || replacementCandidates.length === 0} onClick={() => void propose(replacementItem)}>
                <Replace /> Найти замену
              </button>
              <button type="button" disabled title="Удаление доступно после согласования с клиентом">
                <Trash2 /> Удалить позицию
              </button>
              <button type="button" onClick={() => { setReplacementItemId(null); onContactClient?.(); }}>
                <MessageCircle /> Связаться с клиентом
              </button>
            </div>
            <small>Замена отправляется клиенту на подтверждение и не считается собранной до его решения.</small>
          </section>
        </div>
      )}
    </section>
  );
}
