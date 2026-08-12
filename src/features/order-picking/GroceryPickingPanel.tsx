import { Check, PackageCheck, Replace } from 'lucide-react';
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
  onChanged
}: {
  items: RestaurantOrderItem[];
  products: Product[];
  canPick: boolean;
  onChanged?: () => void;
}) {
  const availableProducts = useMemo(
    () => products.filter((product) => !product.is_hidden && (product.is_unlimited || product.stock_count > 0)),
    [products]
  );
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [replacementByItem, setReplacementByItem] = useState<Record<string, string>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

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
    const candidates = availableProducts.filter((product) => product.id !== item.productId);
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
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось предложить замену');
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <section className="grocery-picking" aria-label="Сборка продуктового заказа">
      <header>
        <div>
          <h3><PackageCheck /> Сборка заказа</h3>
          <p>Подтверждайте товар по ходу сборки. Для весового товара укажите фактический вес.</p>
        </div>
        <strong>{items.filter((item) => ['picked', 'substituted', 'removed'].includes(item.fulfillmentState ?? 'pending')).length}/{items.length}</strong>
      </header>

      {!canPick && <p className="grocery-picking__notice">Сначала примите назначенный заказ в работу.</p>}

      <div className="grocery-picking__lines">
        {items.map((item) => {
          const state = item.fulfillmentState ?? 'pending';
          const candidates = availableProducts.filter((product) => product.id !== item.productId);
          const resolved = ['picked', 'substitution_pending', 'substituted', 'removed'].includes(state);
          return (
            <article key={item.id} data-state={state}>
              <div>
                <strong>{item.title}</strong>
                <small>
                  Заказано: {displayQuantity(item)}
                  {state === 'picked' && item.saleUnit === 'weight' ? ` · Собрано: ${displayQuantity(item, true)}` : ''}
                </small>
              </div>
              <span>{stateLabels[state]}</span>
              {!resolved && item.saleUnit === 'weight' && (
                <label>
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
              {!resolved && candidates.length > 0 && (
                <label>
                  Предложить замену
                  <select
                    value={replacementByItem[item.id] ?? candidates[0].id}
                    onChange={(event) => setReplacementByItem((current) => ({ ...current, [item.id]: event.target.value }))}
                  >
                    {candidates.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                  </select>
                </label>
              )}
              {!resolved && (
                <div>
                  <button type="button" disabled={!canPick || busyItemId === item.id} onClick={() => void picked(item)}>
                    <Check /> Собрано
                  </button>
                  <button type="button" disabled={!canPick || busyItemId === item.id || candidates.length === 0} onClick={() => void propose(item)}>
                    <Replace /> Нет в наличии
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
