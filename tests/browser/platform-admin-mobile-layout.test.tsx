import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PlatformMobileNav } from '../../src/pages/platform-admin/PlatformAdminApp';
import '../../src/pages/platform-admin/platform-admin.css';

test('keeps client controls, revenue, and status badges compact at 319px', async () => {
  await page.viewport(319, 613);

  try {
    await render(
      <main className="platform-page clients-page">
        <section className="restaurant-revenue-summary">
          <header>
            <h2>Рестораны по выручке</h2>
            <strong>11 130 ₽</strong>
          </header>
        </section>

        <section className="client-filters">
          <label className="search-field">
            <svg aria-hidden="true" />
            <input aria-label="Поиск клиентов" placeholder="Поиск клиентов..." />
          </label>
          <button type="button">Фильтр</button>
        </section>

        <article className="client-card">
          <div className="client-card__meta">
            <span className="status-badge status-badge--active">Активен</span>
            <span className="publish-badge is-published"><span />Опубликован</span>
          </div>
        </article>
      </main>
    );

    const filters = document.querySelector<HTMLElement>('.client-filters')!;
    const search = document.querySelector<HTMLInputElement>('.search-field input')!;
    const revenue = document.querySelector<HTMLElement>('.restaurant-revenue-summary strong')!;
    const status = document.querySelector<HTMLElement>('.status-badge')!;

    expect(search.getBoundingClientRect().right).toBeLessThanOrEqual(filters.getBoundingClientRect().right);
    expect(getComputedStyle(revenue).whiteSpace).toBe('nowrap');
    expect(revenue.getBoundingClientRect().height).toBeLessThan(30);
    expect(getComputedStyle(status).display).toBe('flex');
    expect(getComputedStyle(status).alignItems).toBe('center');
    expect(getComputedStyle(status).marginTop).toBe('0px');
  } finally {
    await page.viewport(414, 896);
  }
});

test('groups the mobile More menu into compact business, delivery and platform sections', async () => {
  await page.viewport(372, 576);

  try {
    const screen = await render(<PlatformMobileNav route="clients" onNavigate={() => undefined} />);
    await screen.getByRole('button', { name: 'Ещё' }).click();

    await expect.element(screen.getByRole('heading', { name: 'Бизнес и каталоги' })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Доставка' })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Статистика и деньги' })).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Платформа' })).toBeVisible();

    const delivery = screen.getByRole('region', { name: 'Доставка' });
    await expect.element(delivery.getByRole('button', { name: 'География' })).toBeVisible();
    await expect.element(delivery.getByRole('button', { name: 'Асфальт' })).toBeVisible();
    await expect.element(delivery.getByRole('button', { name: 'Водители' })).toBeVisible();

    const groupGrid = document.querySelector<HTMLElement>('.platform-more-group > div')!;
    expect(getComputedStyle(groupGrid).gridTemplateColumns.split(' ').length).toBe(2);
    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  } finally {
    await page.viewport(414, 896);
  }
});
