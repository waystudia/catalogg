import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ConsentModal } from '../../src/pages/catalog-admin/CatalogAdminApp';

test('keeps the restaurant consent flow reachable on a short mobile viewport', async () => {
  await page.viewport(378, 576);

  try {
    const screen = await render(<ConsentModal slug="finik" onConfirmed={() => undefined} />);
    const dialog = document.querySelector<HTMLElement>('.consent-modal')!;
    const documentScroll = document.querySelector<HTMLElement>('.consent-modal__scroll')!;

    expect(dialog.getBoundingClientRect().height).toBeLessThanOrEqual(window.innerHeight - 24);
    expect(getComputedStyle(dialog).overflowY).toBe('auto');
    expect(getComputedStyle(dialog).touchAction).toBe('pan-y');
    expect(dialog.scrollHeight).toBeGreaterThan(dialog.clientHeight);
    expect(documentScroll.scrollHeight).toBeGreaterThan(documentScroll.clientHeight);
    expect(getComputedStyle(documentScroll).overflowY).toBe('auto');

    documentScroll.scrollTop = documentScroll.scrollHeight;
    documentScroll.dispatchEvent(new Event('scroll', { bubbles: true }));

    const checkboxes = screen.getByRole('checkbox');
    await expect.element(checkboxes.nth(0)).toBeEnabled();
    await expect.element(checkboxes.nth(1)).toBeEnabled();

    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await expect.element(screen.getByRole('button', { name: 'Подтвердить' })).toBeEnabled();

    dialog.scrollTop = dialog.scrollHeight;
    dialog.dispatchEvent(new Event('scroll', { bubbles: true }));
    const dialogRect = dialog.getBoundingClientRect();
    const buttonRect = document.querySelector<HTMLButtonElement>('.consent-modal > button')!.getBoundingClientRect();
    expect(buttonRect.top).toBeGreaterThanOrEqual(dialogRect.top);
    expect(buttonRect.bottom).toBeLessThanOrEqual(dialogRect.bottom);
  } finally {
    await page.viewport(414, 896);
  }
});
