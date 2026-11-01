import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ProductChoiceOption } from '../../entities/models';
import { formatRublePrice } from '../../entities/productPricing';

/** The original compact variant menu, positioned above its product card. */
export function ProductVariantPicker({ title, options, anchorRef, onChoose, onDismiss }: {
  title: string;
  options: ProductChoiceOption[];
  anchorRef: RefObject<HTMLElement>;
  onChoose: (name: string) => void;
  onDismiss: () => void;
}) {
  const menuRef = useRef<HTMLElement | null>(null);
  const focused = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect(), menu = menuRef.current;
      if (!rect || !menu) return;
      const half = menu.offsetWidth / 2;
      setPosition({
        left: Math.max(half + 12, Math.min(window.innerWidth - half - 12, rect.left + rect.width / 2)),
        top: Math.min(window.innerHeight - 12, Math.max(menu.offsetHeight + 12, rect.top - 8))
      });
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [anchorRef]);
  useLayoutEffect(() => {
    if (position && !focused.current) {
      menuRef.current?.querySelector('button')?.focus({ preventScroll: true });
      focused.current = true;
    }
  }, [position]);
  return createPortal(
    <div className="product-tile__choice-overlay" onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDismiss(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <button className="product-tile__choice-backdrop" type="button" aria-label="Закрыть выбор варианта" onClick={onDismiss} />
      <section ref={menuRef} className="product-tile__choice-menu" role="dialog" aria-modal="true" aria-label={`Варианты ${title}`} style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>
        <span>Выберите вариант</span>
        {options.map(choice => <button key={choice.name} type="button" onClick={() => onChoose(choice.name)}>
          <b>{choice.name}</b><small>{formatRublePrice(choice.price)}</small>
        </button>)}
      </section>
    </div>, document.body
  );
}
