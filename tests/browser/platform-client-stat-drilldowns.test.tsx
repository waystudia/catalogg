import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ClientStatsPanel } from '../../src/pages/platform-admin/PlatformAdminApp';
import type { PlatformStats } from '../../src/shared/api/platformTypes';

const stats: PlatformStats = {
  totalClients: 2,
  activeCatalogs: 2,
  daysActive: 42,
  monthlyRevenue: 8590,
  monthlyViews: 0,
  totalDebt: 601,
  totalOrders: 9,
  driverDeliveries: 3,
  restaurantStats: [
    {
      id: 'catalog-rizih',
      clientId: 'client-rizih',
      name: 'Rizih',
      slug: 'rizih',
      revenue: 5930,
      debt: 415,
      testDebt: 0,
      ordersCount: 6,
      driverDeliveries: 2
    },
    {
      id: 'catalog-mangal',
      clientId: 'client-mangal',
      name: 'Мангал',
      slug: 'mangal',
      revenue: 2660,
      debt: 0,
      testDebt: 30,
      ordersCount: 3,
      driverDeliveries: 1
    }
  ]
};

test('opens business revenue, order and debt details from the Clients card', async () => {
  const screen = await render(<ClientStatsPanel stats={stats} />);

  await screen.getByRole('button', { name: /Клиенты 2/u }).click();

  const dialog = screen.getByRole('dialog', { name: 'Бизнесы: выручка, заказы и долг' });
  await expect.element(dialog.getByText('Rizih', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('5 930 ₽', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('6 заказов', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('Долг 415 ₽', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('Тестовый долг 30 ₽', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('Долг 0 ₽', { exact: true })).toBeVisible();
});

test('opens delivery counts by business and closes the details', async () => {
  const screen = await render(<ClientStatsPanel stats={stats} />);

  await screen.getByRole('button', { name: /Доставки 3/u }).click();

  const dialog = screen.getByRole('dialog', { name: 'Доставки по бизнесам' });
  await expect.element(dialog.getByText('Rizih', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('Доставок: 2', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('Мангал', { exact: true })).toBeVisible();
  await expect.element(dialog.getByText('Доставок: 1', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Доставки по бизнесам' })).not.toBeInTheDocument();
});

test('shows an empty-state explanation and closes it with Escape', async () => {
  const screen = await render(<ClientStatsPanel stats={{ ...stats, totalClients: 0, restaurantStats: [] }} />);

  await screen.getByRole('button', { name: /Клиенты 0/u }).click();
  await expect.element(screen.getByText('Данные появятся после первого заказа.')).toBeVisible();

  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog', { name: 'Бизнесы: выручка, заказы и долг' })).not.toBeInTheDocument();
});
