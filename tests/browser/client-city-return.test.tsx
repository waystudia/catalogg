import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CityPage } from '../../src/pages/client-platform/ClientPlatformApp';
import type { ClientPlatformSnapshot } from '../../src/features/client-platform/types';

const snapshot: ClientPlatformSnapshot = {
  cities: [{
    id: 'tsotsi-yurt',
    slug: 'tsotsi-yurt',
    name: 'Цоци-Юрт',
    region: 'Чеченская Республика',
    isActive: true
  }],
  categories: [],
  restaurants: [],
  reviews: [],
  restaurantCategories: [],
  dishes: [],
  paymentSettings: [],
  banners: [],
  contentPages: [],
  supportWhatsapp: '',
  supportPhone: '',
  supportEmail: '',
  supportTelegram: '',
  supportHours: '',
  supportHint: ''
};

function LocationProbe() {
  return <output aria-label="Текущий маршрут">{useLocation().pathname}</output>;
}

const renderCityPicker = (initialEntry: string) => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/city" element={<CityPage snapshot={snapshot} />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>
  </MemoryRouter>
);

test('choosing a settlement returns to Categories when Categories opened the picker', async () => {
  const screen = await renderCityPicker('/city?returnTo=%2Fcategories');

  await screen.getByRole('button', { name: /Цоци-Юрт Пока нет заведений/ }).click();

  await expect.element(screen.getByRole('status', { name: 'Текущий маршрут' })).toHaveTextContent('/categories');
});

test('choosing a settlement returns to Home when Home opened the picker', async () => {
  const screen = await renderCityPicker('/city');

  await screen.getByRole('button', { name: /Цоци-Юрт Пока нет заведений/ }).click();

  await expect.element(screen.getByRole('status', { name: 'Текущий маршрут' })).toHaveTextContent('/');
});
