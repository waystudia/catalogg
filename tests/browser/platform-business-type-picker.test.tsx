import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { BusinessTypeSelect } from '../../src/features/platform-admin-business-types/BusinessTypeSelect';
import { BUSINESS_TYPE_DEFINITIONS } from '../../src/shared/businessRegistry';

test('lets a superadmin choose grocery while future types stay visibly unavailable', async () => {
  const onChange = vi.fn();
  const screen = await render(
    <BusinessTypeSelect
      id="business-type"
      value="restaurant"
      options={BUSINESS_TYPE_DEFINITIONS}
      onChange={onChange}
    />
  );

  await screen.getByLabelText(/тип бизнеса/i).selectOptions('grocery');

  expect(onChange).toHaveBeenCalledWith('grocery');
  await expect.element(screen.getByRole('option', { name: /цветочный магазин.*скоро/i })).toBeDisabled();
  await expect.element(screen.getByRole('option', { name: /аптека.*требуется проверка/i })).toBeDisabled();
});
