import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router-dom";
import { PartnerRegistrationPage } from "../../src/features/partner-registration/PartnerRegistrationPage";

test("partner role controls remain visible on a mobile viewport", async () => {
  await page.viewport(372, 576);
  const screen = await render(
    <MemoryRouter>
      <PartnerRegistrationPage />
    </MemoryRouter>,
  );

  const back = screen.getByRole("button", { name: "Назад" });
  const seller = screen.getByRole("button", { name: /Продавец/ });
  await expect.element(back).toBeVisible();
  await expect.element(seller).toBeVisible();
  expect(getComputedStyle(back.element()).color).not.toBe("rgb(255, 255, 255)");
  expect(getComputedStyle(seller.element()).color).not.toBe(
    "rgb(255, 255, 255)",
  );
  expect(document.documentElement.scrollWidth).toBe(
    document.documentElement.clientWidth,
  );
});

test("courier form offers examples, settlement suggestions, distinct transport icons and colors", async () => {
  await page.viewport(372, 576);
  const screen = await render(
    <MemoryRouter>
      <PartnerRegistrationPage />
    </MemoryRouter>,
  );

  await screen.getByRole("button", { name: /Курьер/ }).click();
  await screen.getByLabelText("Имя и фамилия").fill("Ахмед Исаев");
  await screen.getByLabelText("Телефон").fill("+7 928 000-00-00");
  await screen.getByLabelText("Почта").fill("ahmed@example.ru");
  await screen.getByLabelText("Пароль", { exact: true }).fill("password123");
  await screen.getByLabelText("Повторите пароль").fill("password123");
  await screen.getByRole("button", { name: "Продолжить" }).click();

  const residence = screen.getByLabelText("Где проживаете");
  await expect
    .element(residence)
    .toHaveAttribute("placeholder", "Выберите село или введите своё");
  await expect
    .element(residence)
    .toHaveAttribute("list", "partner-settlements");
  await residence.fill("Моё село");
  await screen.getByRole("button", { name: "Выбрать транспорт" }).click();

  const plate = screen.getByLabelText("Госномер");
  await expect
    .element(screen.getByLabelText("Марка"))
    .toHaveAttribute("placeholder", "Например, Lada");
  await expect
    .element(screen.getByLabelText("Модель"))
    .toHaveAttribute("placeholder", "Например, Granta");
  await expect.element(plate).toHaveAttribute("lang", "en");
  await plate.fill("а123вс 95");
  await expect.element(plate).toHaveValue("A123BC 95");
  await screen.getByRole("button", { name: "Красный" }).click();
  await expect.element(screen.getByLabelText("Цвет", { exact: true })).toHaveValue("Красный");

  const icons = document.querySelectorAll(
    ".partner-registration__transport svg",
  );
  expect(icons).toHaveLength(3);
  expect(new Set(Array.from(icons, (icon) => icon.innerHTML)).size).toBe(3);
  expect(document.documentElement.scrollWidth).toBe(
    document.documentElement.clientWidth,
  );
});
