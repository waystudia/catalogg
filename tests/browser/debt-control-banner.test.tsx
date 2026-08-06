import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { DebtControlBanner } from '../../src/features/restaurant-billing/DebtControlBanner';

const baseStatus = {
  accountType: 'restaurant' as const,
  accountId: 'restaurant-1',
  debtAmount: 4_000,
  warningAmount: 4_000,
  limitAmount: 5_000,
  graceHours: 24,
  limitReachedAt: null,
  deadline: null,
  blocked: false,
  blockedAt: null
};

test('warns the restaurant at 4 000 ₽ without claiming that work is blocked', async () => {
  const screen = await render(<DebtControlBanner status={baseStatus} accountLabel="ресторана" />);

  await expect.element(screen.getByText('Задолженность приближается к лимиту')).toBeVisible();
  await expect.element(screen.getByText(/4\s000 ₽ из 5\s000 ₽/)).toBeVisible();
  await expect.element(screen.getByText(/новые заказы продолжают поступать/i)).toBeVisible();
});

test('shows the 24-hour countdown and explains what is blocked after it expires', async () => {
  const screen = await render(
    <DebtControlBanner
      status={{
        ...baseStatus,
        accountType: 'driver',
        debtAmount: 5_000,
        limitReachedAt: '2026-08-06T11:00:00.000Z',
        deadline: '2026-08-06T13:02:03.000Z'
      }}
      accountLabel="водителя"
      now={new Date('2026-08-06T12:00:00.000Z')}
    />
  );

  await expect.element(screen.getByText('До ограничения новых доставок')).toBeVisible();
  await expect.element(screen.getByText('01:02:03')).toBeVisible();
  await expect.element(screen.getByText(/текущую доставку можно завершить/i)).toBeVisible();
});

test('states that only new work is blocked after the deadline', async () => {
  const screen = await render(
    <DebtControlBanner
      status={{ ...baseStatus, debtAmount: 5_200, blocked: true }}
      accountLabel="ресторана"
    />
  );

  await expect.element(screen.getByText('Новые заказы временно заблокированы')).toBeVisible();
  await expect.element(screen.getByText(/погасите долг WayYaam/i)).toBeVisible();
});
