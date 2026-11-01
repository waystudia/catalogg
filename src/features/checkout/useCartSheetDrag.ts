import { useEffect, useRef, useState } from 'react';

type Drag = { x: number; y: number; eligible: boolean; dragging: boolean; handle: boolean; pointerId?: number };

/** Downward pulls dismiss only when the scroll surface started at its top. */
export function useCartSheetDrag(isOpen: boolean, onDismiss: () => void) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const callbackRef = useRef(onDismiss);
  const closeRef = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [motion, setMotion] = useState<'idle' | 'dragging' | 'settling' | 'closing'>('idle');
  useEffect(() => { callbackRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!isOpen || !sheet) return;
    let drag: Drag | null = null;
    let closing = false;
    let timer: number | undefined;
    setOffset(0);
    setMotion('idle');
    suppressClick.current = false;
    const close = () => {
      if (closing) return;
      closing = true;
      setMotion('closing');
      setOffset(sheet.getBoundingClientRect().height + 24);
      timer = window.setTimeout(() => callbackRef.current(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
    };
    closeRef.current = close;
    const begin = (target: EventTarget | null, x: number, y: number, pointerId?: number) => {
      if (closing) return;
      const element = target instanceof Element ? target : null;
      if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const handle = Boolean(element?.closest('.cart-sheet__handle'));
      drag = { x, y, pointerId, handle, eligible: handle || sheet.scrollTop <= 1, dragging: false };
      suppressClick.current = false;
    };
    const move = (event: Event, x: number, y: number) => {
      if (!drag || !drag.eligible || closing) return;
      const dx = x - drag.x, dy = y - drag.y;
      if (!drag.dragging && ((!drag.handle && sheet.scrollTop > 1) || dy < -6 || Math.abs(dx) > Math.abs(dy) + 6)) {
        drag.eligible = false;
        return;
      }
      if (!drag.dragging && (dy <= 0 || Math.abs(dx) > dy)) return;
      if (event.cancelable) event.preventDefault();
      if (!drag.dragging && dy < 6) return;
      drag.dragging = true;
      suppressClick.current = true;
      setMotion('dragging');
      setOffset(Math.max(0, dy));
    };
    const finish = (y: number) => {
      if (!drag) return;
      const distance = y - drag.y, wasDragging = drag.dragging;
      drag = null;
      if (!wasDragging) return;
      const threshold = Math.min(120, Math.max(72, sheet.clientHeight * .16));
      if (distance >= threshold) close();
      else { setMotion('settling'); setOffset(0); }
    };
    const cancel = () => {
      if (closing) return;
      if (drag?.dragging) { setMotion('settling'); setOffset(0); }
      drag = null;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.isPrimary && event.button === 0) begin(event.target, event.clientX, event.clientY, event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && drag?.pointerId === event.pointerId) move(event, event.clientX, event.clientY);
    };
    const pointerCancel = (event: PointerEvent) => { if (event.pointerType !== 'touch') cancel(); };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && drag?.pointerId === event.pointerId) finish(event.clientY);
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancel(); return; }
      begin(event.target, event.touches[0].clientX, event.touches[0].clientY);
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancel(); return; }
      move(event, event.touches[0].clientX, event.touches[0].clientY);
    };
    const touchEnd = (event: TouchEvent) => {
      if (event.touches.length) { cancel(); return; }
      if (event.changedTouches[0]) finish(event.changedTouches[0].clientY);
    };
    sheet.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('blur', cancel);
    sheet.addEventListener('touchstart', touchStart, { passive: true });
    sheet.addEventListener('touchmove', touchMove, { passive: false });
    sheet.addEventListener('touchend', touchEnd);
    sheet.addEventListener('touchcancel', cancel);
    return () => {
      window.clearTimeout(timer);
      closeRef.current = null;
      sheet.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('blur', cancel);
      sheet.removeEventListener('touchstart', touchStart);
      sheet.removeEventListener('touchmove', touchMove);
      sheet.removeEventListener('touchend', touchEnd);
      sheet.removeEventListener('touchcancel', cancel);
    };
  }, [isOpen]);
  return { sheetRef, offset, motion, suppressClick, dismiss: () => closeRef.current?.() };
}
