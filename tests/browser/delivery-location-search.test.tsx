import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { DeliveryMapPicker } from '../../src/shared/DeliveryMapPicker';
import type { DeliveryLocationSearchResult } from '../../src/shared/deliveryGeocoder';
import '../../src/app/styles.css';

const searchResult: DeliveryLocationSearchResult = {
  id: '208046098',
  name: 'Цоци-Юрт',
  label: 'Цоци-Юрт, Курчалоевский район, Чеченская Республика, Россия',
  lat: 43.240696,
  lng: 45.997684
};

test('searches only on submit and selects a Chechnya settlement as a manual point', async () => {
  const searchLocations = vi.fn(async () => [searchResult]);
  const onChange = vi.fn();
  const onSearchSelect = vi.fn();
  const screen = await render(
    <DeliveryMapPicker
      lat={43.3184}
      lng={45.6927}
      onLocate={vi.fn()}
      onChange={onChange}
      onSearchSelect={onSearchSelect}
      searchLocations={searchLocations}
    />
  );

  await screen.getByRole('searchbox', { name: 'Село, город или улица в Чечне' }).fill('Цоци-Юрт');
  expect(searchLocations).not.toHaveBeenCalled();
  await screen.getByRole('button', { name: 'Найти на карте' }).click();
  await expect.element(screen.getByRole('button', { name: /Цоци-Юрт, Курчалоевский район/ })).toBeVisible();
  expect(searchLocations).toHaveBeenCalledWith('Цоци-Юрт');

  await screen.getByRole('button', { name: /Цоци-Юрт, Курчалоевский район/ }).click();
  expect(onChange).toHaveBeenCalledWith({ lat: 43.240696, lng: 45.997684 });
  expect(onSearchSelect).toHaveBeenCalledWith(searchResult);
  await expect.element(screen.getByText('43.2406960, 45.9976840')).toBeVisible();
  await expect.element(screen.getByText('точка выбрана вручную')).toBeVisible();
});

test('switches between street and labeled satellite layers without losing the selected point', async () => {
  const screen = await render(
    <DeliveryMapPicker
      lat={43.240696}
      lng={45.997684}
      onLocate={vi.fn()}
      onChange={vi.fn()}
    />
  );

  await screen.getByRole('button', { name: 'Спутник' }).click();
  await expect.element(screen.getByRole('button', { name: 'Спутник' })).toHaveAttribute('aria-pressed', 'true');
  await expect.element(screen.getByText(/Esri/)).toBeVisible();
  await screen.getByRole('button', { name: 'Приблизить карту' }).click();
  await expect.element(screen.getByText('43.2406960, 45.9976840')).toBeVisible();
});

test('shows a useful empty result and keeps high-accuracy location available', async () => {
  const onLocate = vi.fn();
  const screen = await render(
    <DeliveryMapPicker
      lat={43.3184}
      lng={45.6927}
      onLocate={onLocate}
      onChange={vi.fn()}
      searchLocations={vi.fn(async () => [])}
    />
  );

  await screen.getByRole('searchbox', { name: 'Село, город или улица в Чечне' }).fill('Неизвестное место');
  await screen.getByRole('button', { name: 'Найти на карте' }).click();
  await expect.element(screen.getByText('В Чеченской Республике ничего не найдено.')).toBeVisible();
  await screen.getByRole('button', { name: 'Отследить моё местоположение' }).click();
  expect(onLocate).toHaveBeenCalledOnce();
});
