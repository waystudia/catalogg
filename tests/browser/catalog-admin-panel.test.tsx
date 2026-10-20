import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { AdminPanel } from '../../src/app/App';
import { useAuthStore } from '../../src/features/stores';

test('shows only one centered add button in the catalog admin overlay', async () => {
  useAuthStore.setState({ isAdmin: true });
  const onAdd = vi.fn();

  try {
    const screen = await render(<AdminPanel onAdd={onAdd} />);

    await expect.element(screen.getByRole('button', { name: 'Добавить' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Настройки' })).not.toBeInTheDocument();
    await screen.getByRole('button', { name: 'Добавить' }).click();
    expect(onAdd).toHaveBeenCalledOnce();
  } finally {
    useAuthStore.setState({ isAdmin: false });
  }
});
