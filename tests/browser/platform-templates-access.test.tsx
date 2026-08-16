import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { PlatformTemplatesPage } from '../../src/features/platform-admin-templates/PlatformTemplatesPage';
import { getSupabaseAuthStorage, getSupabaseAuthStorageKey } from '../../src/shared/supabaseAuthScope';
import '../../src/pages/platform-admin/platform-admin.css';

test('super admin can preview a template and hands the current session to its settings', async () => {
  const storage = getSupabaseAuthStorage();
  const sourceKey = getSupabaseAuthStorageKey('platform-admin');
  const targetKey = getSupabaseAuthStorageKey('restaurant-admin');
  storage.setItem(sourceKey, '{"access_token":"platform-session"}');
  storage.removeItem(targetKey);

  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <PlatformTemplatesPage templates={[{
        templateVersionId: 'template-1',
        templateKey: 'grocery',
        templateName: 'Продуктовый магазин',
        businessType: 'grocery',
        version: 1,
        description: 'Общий продуктовый шаблон',
        templateCatalogSlug: 'grocery',
        isCatalogTemplate: true
      }]} />
    </QueryClientProvider>
  );

  const preview = screen.getByRole('link', { name: 'Просмотреть' });
  await expect.element(preview).toHaveAttribute('href', expect.stringContaining('#/grocery'));
  await expect.element(preview).toHaveAttribute('target', '_blank');

  const settings = screen.getByRole('link', { name: 'Настроить' }).element() as HTMLAnchorElement;
  expect(settings.href).toContain('#/business/grocery');
  settings.addEventListener('click', (event) => event.preventDefault(), { once: true });
  settings.click();
  expect(storage.getItem(targetKey)).toBe('{"access_token":"platform-session"}');
});
