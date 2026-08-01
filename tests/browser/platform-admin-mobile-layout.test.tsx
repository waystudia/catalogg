import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
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
