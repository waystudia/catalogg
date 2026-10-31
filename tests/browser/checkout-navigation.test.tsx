import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { useCheckoutNavigation } from '../../src/features/checkout/useCheckoutNavigation';

function Journey() {
  const location = useLocation();
  const [screen, setScreen] = useState('catalog');
  const [cartOpen, setCartOpen] = useState(false);
  const navigation = useCheckoutNavigation('mangal', screen, setScreen, setCartOpen);
  return <><p>{location.pathname}{location.search}</p><p>{cartOpen ? 'Корзина открыта' : 'Корзина закрыта'}</p>
    <button onClick={navigation.openCheckout}>Оформить</button>
    <button onClick={navigation.goBackFromCheckout}>Назад</button>
    <button onClick={navigation.closeCart}>Закрыть корзину</button></>;
}

test('checkout returns to the catalog cart and closing it returns to the user cart', async () => {
  const screen = await render(<MemoryRouter initialEntries={['/cart', { pathname: '/mangal', search: '?cart=1', state: { cartReturn: '/cart' } }]}><Journey /></MemoryRouter>);
  await expect.element(screen.getByText('Корзина открыта')).toBeVisible();
  await screen.getByRole('button', { name: 'Оформить', exact: true }).click();
  await expect.element(screen.getByText('/mangal/checkout', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect.element(screen.getByText('/mangal?cart=1', { exact: true })).toBeVisible();
  await screen.getByRole('button', { name: 'Закрыть корзину' }).click();
  await expect.element(screen.getByText('/cart', { exact: true })).toBeVisible();
});

test('a directly opened checkout has a safe user cart fallback', async () => {
  const screen = await render(<MemoryRouter initialEntries={['/mangal/checkout']}><Journey /></MemoryRouter>);
  await screen.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect.element(screen.getByText('/cart', { exact: true })).toBeVisible();
});

test('an untracked checkout origin never treats an unrelated earlier entry as safe Back', async () => {
  const screen = await render(<MemoryRouter initialEntries={['/driver/profile', { pathname:'/mangal/checkout', state:{checkoutOrigin:'/mangal?cart=1'} }]}><Journey /></MemoryRouter>);
  await screen.getByRole('button',{name:'Назад',exact:true}).click();
  await expect.element(screen.getByText('/mangal?cart=1',{exact:true})).toBeVisible();
});
