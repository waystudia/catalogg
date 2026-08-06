import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { LegalSurface } from '../../src/shared/LegalSurface';

test('POS hides the site footer so the cashier workspace does not create page scrolling', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/mangal/pos']}>
      <LegalSurface />
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('contentinfo', { name: 'Юридическая информация' })).not.toBeInTheDocument();
});

test('public pages keep the legal footer available', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/mangal']}>
      <LegalSurface />
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('contentinfo', { name: 'Юридическая информация' })).toBeVisible();
});
