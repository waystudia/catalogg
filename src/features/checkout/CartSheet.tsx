import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Minus, Plus, ShieldCheck, ShoppingCart, Trash2 } from 'lucide-react';
import { getCartLineId, getSelectedModifierDetails, getCartItemPrice } from '../../entities/productModifiers';
import { selectCartCount, selectCartTotal, useCartStore } from '../stores';
import { playCartSound } from '../restaurant-settings/catalogAdminModel';
import { SafeImage } from '../../shared/SafeImage';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

export function CartSheet({
  isOpen,
  isLoading,
  onClose,
  onCheckout,
  onMenu
}: {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onCheckout: () => void;
  onMenu: () => void;
}) {
  const items = useCartStore((state) => state.items);
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const remove = useCartStore((state) => state.remove);
  const count = selectCartCount(items);
  const subtotal = selectCartTotal(items);
  const delivery = 0;
  const total = subtotal + delivery;
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="cart-sheet-backdrop" onClick={onClose}>
      <section
        className="cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Корзина"
        style={{ transform: `translateY(${dragOffset}px)` }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="cart-sheet__handle"
          type="button"
          aria-label="Свернуть корзину"
          onClick={(event) => {
            if (event.detail === 0 || !dragged.current) onClose();
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            dragStart.current = event.clientY;
            dragged.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            const distance = Math.max(0, event.clientY - dragStart.current);
            if (distance > 6) dragged.current = true;
            setDragOffset(distance);
          }}
          onPointerUp={(event) => {
            if (dragStart.current === null) return;
            const distance = event.clientY - dragStart.current;
            dragStart.current = null;
            setDragOffset(0);
            if (distance >= 72) onClose();
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            dragged.current = true;
            setDragOffset(0);
          }}
        ><span /></button>
        <header className="cart-sheet__header">
          <button type="button" onClick={onClose} aria-label="Вернуться назад">
            <ArrowLeft />
          </button>
          <div>
            <h2>Корзина</h2>
            <p>{count} {count % 10 === 1 && count % 100 !== 11 ? 'товар' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'товара' : 'товаров'}</p>
          </div>
          <span aria-hidden="true" />
        </header>

        {isLoading && (
          <div className="cart-sheet__list">
            {[1, 2, 3].map((item) => (
              <div className="cart-skeleton" key={item}>
                <span />
                <div>
                  <b />
                  <b />
                  <b />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && count === 0 && (
          <div className="cart-empty">
            <ShoppingCart />
            <h3>Корзина пуста</h3>
            <button className="primary-wide" type="button" onClick={onMenu}>
              Перейти к меню
            </button>
          </div>
        )}

        {!isLoading && count > 0 && (
          <>
            <div className="cart-sheet__list">
              {items.map((item) => {
                const lineId = getCartLineId(item);
                const modifierLabel = getSelectedModifierDetails(item).map(({ group, option }) => `${group.name}: ${option.name}`).join(' · ');
                return (
                <article className="cart-item-card" key={lineId}>
                  <SafeImage src={item.product.image_url} alt={item.product.title} fallbackKind={item.product.placeholder_kind} width={320} height={240} loading="lazy" />
                  <div className="cart-item-card__content">
                    <div className="cart-item-card__top">
                      <div>
                        <h3>{item.product.title}</h3>
                        {item.selected_choice && <small className="cart-item-card__choice">{item.selected_choice}</small>}
                        {modifierLabel && <small className="cart-item-card__choice">{modifierLabel}</small>}
                        {item.selected_weight !== undefined && <small className="cart-item-card__choice">Вес: {item.selected_weight.toLocaleString('ru-RU')} кг</small>}
                        {item.inscription && <small className="cart-item-card__choice">Надпись: «{item.inscription}»</small>}
                        {item.decoration_comment && <small className="cart-item-card__choice">Оформление: {item.decoration_comment}</small>}
                        {item.production_date && <small className="cart-item-card__choice">Дата: {item.production_date}</small>}
                        {item.production_time && <small className="cart-item-card__choice">Время: {item.production_time}</small>}
                        <p>{item.product.description}</p>
                      </div>
                      <button className="cart-item-card__remove" type="button" onClick={() => remove(lineId)} aria-label={`Удалить ${item.product.title}`}>
                        <Trash2 />
                      </button>
                    </div>
                    <div className="cart-item-card__bottom">
                      <strong>{formatPrice(getCartItemPrice(item))}</strong>
                      <div className="cart-quantity" aria-label={`Количество ${item.product.title}`}>
                        <button
                          type="button"
                          onClick={() => {
                            decrement(lineId);
                            playCartSound('remove');
                          }}
                          aria-label="Уменьшить"
                        >
                          <Minus />
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => add(item.product, item.selected_choice, item.selected_modifiers, {
                          selectedWeight: item.selected_weight,
                          inscription: item.inscription,
                          decorationComment: item.decoration_comment,
                          productionDate: item.production_date,
                          productionTime: item.production_time
                        })} aria-label="Увеличить">
                          <Plus />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );})}
            </div>

            <section className="cart-summary">
              <p>
                <span>Сумма товаров</span>
                <strong>{formatPrice(subtotal)}</strong>
              </p>
              <p>
                <span>Доставка</span>
                <strong>{formatPrice(delivery)}</strong>
              </p>
              <p className="cart-summary__total">
                <span>Итого</span>
                <strong>{formatPrice(total)}</strong>
              </p>
            </section>

            <button className="primary-wide cart-checkout" type="button" onClick={onCheckout}>
              Оформить заказ <ArrowRight />
            </button>
            <p className="cart-safe">
              <ShieldCheck /> Безопасная оплата
            </p>
          </>
        )}
      </section>
    </div>
  );
}
