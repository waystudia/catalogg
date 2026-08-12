import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DriverRestaurantAssignmentsEditor } from "../../src/features/platform-admin-drivers/DriverRestaurantAssignmentsEditor";
import type { DriverRestaurantAssignment } from "../../src/shared/api/driversApi";
import "../../src/features/platform-admin-drivers/platform-drivers.css";

const restaurants = [
  { id: "mangal", name: "Мангал" },
  { id: "mangal-test", name: "Мангал тест" },
  { id: "cafe", name: "Кафе Уют" },
];

const assigned = (
  overrides: Partial<DriverRestaurantAssignment> = {},
): DriverRestaurantAssignment => ({
  restaurantId: "mangal",
  restaurantName: "Мангал",
  isPrimary: true,
  priority: 1,
  courierType: "staff_salaried",
  ...overrides,
});

test("shows only linked restaurants until the admin searches and connects another restaurant", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <DriverRestaurantAssignmentsEditor
      restaurants={restaurants}
      assignments={[assigned()]}
      onChange={onChange}
    />,
  );

  await expect
    .element(screen.getByText("Мангал", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Комиссию 30 ₽ за доставку платит ресторан"))
    .toBeVisible();
  await expect
    .element(screen.getByText("Мангал тест", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Кафе Уют", { exact: true }))
    .not.toBeInTheDocument();

  await screen.getByLabelText("Найти ресторан").fill("  МАНГАЛ  ");
  await expect
    .element(screen.getByText("Мангал тест", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Подключить Мангал тест" }).click();

  expect(onChange).toHaveBeenLastCalledWith([
    assigned(),
    expect.objectContaining({
      restaurantId: "mangal-test",
      restaurantName: "Мангал тест",
      courierType: null,
      isPrimary: false,
    }),
  ]);
});

test("lets the admin choose the shared courier type and primary flag for a linked restaurant", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <DriverRestaurantAssignmentsEditor
      restaurants={restaurants}
      assignments={[assigned({ courierType: null, isPrimary: false })]}
      onChange={onChange}
    />,
  );

  await screen.getByLabelText("Штатный без зарплаты — Мангал").click();
  expect(onChange).toHaveBeenLastCalledWith([
    assigned({ courierType: "independent", isPrimary: false }),
  ]);

  await screen.getByLabelText("Основной курьер — Мангал").click();
  expect(onChange).toHaveBeenLastCalledWith([
    assigned({ courierType: null, isPrimary: true }),
  ]);
});

test("fits the redesigned editor into a 319px viewport without horizontal overflow", async () => {
  await page.viewport(319, 680);
  try {
    await render(
      <div style={{ width: "100%" }}>
        <DriverRestaurantAssignmentsEditor
          restaurants={restaurants}
          assignments={[assigned()]}
          onChange={() => undefined}
        />
      </div>,
    );

    const editor = document.querySelector<HTMLElement>(
      ".driver-restaurant-bindings",
    )!;
    expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth);
    expect(editor.getBoundingClientRect().right).toBeLessThanOrEqual(319);
  } finally {
    await page.viewport(414, 896);
  }
});
