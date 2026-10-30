import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { CartSheet } from '../../src/features/checkout/CartSheet';
import { useCartStore } from '../../src/features/stores';
import { products } from '../../src/data/catalog';
import { useCheckoutNavigation } from '../../src/features/checkout/useCheckoutNavigation';
import '../../src/app/styles.css';
import '../../src/pages/client-platform/client-platform.css';

const previousItems = useCartStore.getState().items;
afterEach(() => { useCartStore.setState({ items: previousItems }); });
function CartJourney() {
  const location = useLocation();
  const [screen, setScreen] = useState('catalog');
  const [open, setOpen] = useState(true);
  const navigation = useCheckoutNavigation('mangal', screen, setScreen, setOpen, open);
  return <><p>{location.pathname}{location.search}</p><CartSheet isOpen={open} isLoading={false} onClose={navigation.closeCart} onCheckout={navigation.openCheckout} onMenu={navigation.collapseCartToCatalog} /></>;
}
function drag(handle: Element, distance: number) {
  handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientY: 20 }));
  handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientY: 20 + distance }));
  handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true, clientY: 20 + distance }));
}

test('populated mobile cart has a centered title and returns to the previous cart screen', async () => {
  await page.viewport(319, 620);
  useCartStore.setState({ items: products.slice(0, 4).map(product => ({ product, quantity: 1 })) });
  const screen = await render(<MemoryRouter initialEntries={['/cart', { pathname: '/mangal', search: '?cart=1', state: { cartReturn: '/cart' } }]}><CartJourney /></MemoryRouter>);
  await expect.element(screen.getByRole('dialog', { name: 'Корзина' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Закрыть корзину' }).elements()).toHaveLength(0);
  const title = screen.getByRole('heading', { name: 'Корзина', exact: true }).element().getBoundingClientRect();
  expect(Math.abs(title.left + title.width / 2 - 319 / 2)).toBeLessThan(2);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(319);
  await screen.getByRole('button', { name: 'Вернуться назад' }).click();
  await expect.element(screen.getByText('/cart', { exact: true })).toBeVisible();
  expect(screen.getByRole('dialog').elements()).toHaveLength(0);
});

test('pulling the handle down dismisses the cart, while short drags and scrolling its content do not', async () => {
  useCartStore.setState({ items: products.slice(0, 4).map(product => ({ product, quantity: 1 })) });
  const screen = await render(<MemoryRouter initialEntries={['/mangal?cart=1']}><CartJourney /></MemoryRouter>);
  const handle = screen.getByRole('button', { name: 'Свернуть корзину' }).element();
  // Synthetic pointer events have no active browser pointer to capture.
  handle.setPointerCapture = () => {};
  drag(handle, 25);
  await expect.element(screen.getByRole('dialog')).toBeVisible();
  drag(document.querySelector('.cart-sheet__list')!, 130);
  await expect.element(screen.getByRole('dialog')).toBeVisible();
  drag(handle, 110);
  await expect.element(screen.getByText('/mangal', { exact: true })).toBeVisible();
  expect(screen.getByRole('dialog').elements()).toHaveLength(0);
});


test('pulling down a cart opened from the cart overview reveals the restaurant catalog', async () => {
  useCartStore.setState({ items: products.slice(0, 4).map(product => ({ product, quantity: 1 })) });
  const screen = await render(<MemoryRouter initialEntries={['/cart', { pathname: '/mangal', search: '?cart=1', state: { cartReturn: '/cart' } }]}><CartJourney /></MemoryRouter>);
  const handle = screen.getByRole('button', { name: 'Свернуть корзину' }).element();
  handle.setPointerCapture = () => {};
  drag(handle, 110);
  await expect.element(screen.getByText('/mangal', { exact: true })).toBeVisible();
  expect(screen.getByRole('dialog').elements()).toHaveLength(0);
  expect(useCartStore.getState().items).toHaveLength(4);
});
