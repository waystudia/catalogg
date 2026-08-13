import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { DriverActivationScreen } from '../../src/pages/driver/DriverApp';

test('keeps legal confirmations inside the driver activation screen on a short mobile viewport', async () => {
  await page.viewport(378, 576);

  try {
    const screen = await render(<DriverActivationScreen onActivated={() => undefined} />);
    await expect.element(screen.getByRole('heading', { name: 'Активация водителя' })).toBeVisible();
    await expect.element(screen.getByRole('link', { name: /Оферта для водителя/ })).toBeVisible();
    await expect.element(screen.getByRole('link', { name: /Согласие на обработку данных и геолокацию/ })).toBeVisible();

    const checkboxes = screen.getByRole('checkbox');
    expect(checkboxes.elements().length).toBe(3);
    const submit = screen.getByRole('button', { name: 'Активировать аккаунт' });
    await expect.element(submit).toBeDisabled();

    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();
    await expect.element(submit).toBeEnabled();

    window.scrollTo(0, document.documentElement.scrollHeight);
    await expect.element(submit).toBeVisible();
  } finally {
    await page.viewport(414, 896);
  }
});
