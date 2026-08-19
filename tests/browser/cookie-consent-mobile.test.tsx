import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { LegalSurface } from '../../src/shared/LegalSurface';
import { ANALYTICS_SESSION_KEY, COOKIE_CHOICE_KEY } from '../../src/shared/analyticsConsent';
import '../../src/app/styles.css';

test('keeps the first cookie choice compact and allows changing it later', async () => {
  await page.viewport(390, 844);
  window.localStorage.removeItem(COOKIE_CHOICE_KEY);
  window.localStorage.removeItem(ANALYTICS_SESSION_KEY);

  try {
    const screen = await render(
      <MemoryRouter>
        <main style={{ minHeight: '1200px' }}>Каталог</main>
        <LegalSurface />
      </MemoryRouter>
    );
    const dialog = screen.getByRole('dialog', { name: 'Настройки cookies' });
    await expect.element(dialog).toBeVisible();

    const bounds = dialog.element().getBoundingClientRect();
    expect(bounds.height).toBeLessThanOrEqual(150);
    expect(bounds.left).toBeGreaterThanOrEqual(8);
    expect(bounds.right).toBeLessThanOrEqual(382);
    await expect.element(screen.getByRole('button', { name: 'Разрешить' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Нет, спасибо' })).toBeVisible();

    await screen.getByRole('button', { name: 'Разрешить' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(COOKIE_CHOICE_KEY) ?? '').choice).toBe('analytics');

    await screen.getByRole('button', { name: 'Настройки cookies' }).click();
    const analyticsToggle = screen.getByRole('checkbox', { name: /Анонимная аналитика/ });
    await expect.element(analyticsToggle).toBeChecked();
    await analyticsToggle.click();
    await screen.getByRole('button', { name: 'Сохранить выбор' }).click();
    expect(JSON.parse(window.localStorage.getItem(COOKIE_CHOICE_KEY) ?? '').choice).toBe('necessary');
  } finally {
    window.localStorage.removeItem(COOKIE_CHOICE_KEY);
    window.localStorage.removeItem(ANALYTICS_SESSION_KEY);
    await page.viewport(414, 896);
  }
});
