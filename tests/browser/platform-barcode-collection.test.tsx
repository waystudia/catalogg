import JSZip from "jszip";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SharedProduct } from "../../src/entities/sharedProducts";
import {
  BarcodeCollectionWorkspace,
  PlatformProductDatabasePage,
} from "../../src/features/platform-product-database/PlatformProductDatabasePage";
import {
  parseProcessedCatalog,
  parseXlsxTable,
} from "../../src/features/platform-product-database/barcodeFiles";
import type {
  BarcodeSession,
  BarcodeSessionStore,
} from "../../src/features/platform-product-database/barcodeSessions";
import { SharedProductCatalogPage } from "../../src/features/shared-product-catalog/SharedProductCatalogPage";

const knownProduct: SharedProduct = {
  id: "cola",
  title: "Coca-Cola Original 1 л",
  brand: "Coca-Cola",
  description: null,
  ingredients: null,
  allergens: [],
  countryOfOrigin: null,
  netContentValue: 1,
  netContentUnit: "l",
  categoryId: "drinks",
  categoryName: "Напитки",
  barcode: "5449000054227",
  normalizedBarcode: "05449000054227",
  imageUrl: null,
  version: 1,
  status: "verified",
};

const createMemoryStore = (): BarcodeSessionStore & {
  values: Map<string, BarcodeSession>;
} => {
  const values = new Map<string, BarcodeSession>();
  return {
    values,
    list: async () => Array.from(values.values()),
    put: async (session) => {
      values.set(session.id, structuredClone(session));
    },
    remove: async (id) => {
      values.delete(id);
    },
  };
};

const submitScanner = async (
  screen: Awaited<ReturnType<typeof render>>,
  value: string,
) => {
  const input = screen.getByLabelText("Сканируйте следующий товар");
  await input.fill(value);
  (input.element() as HTMLInputElement).form?.requestSubmit();
};

test("HID scans are saved once, duplicates increment the counter, and known products are identified", async () => {
  const store = createMemoryStore();
  const lookup = vi.fn(async (barcode: string) =>
    barcode === knownProduct.barcode ? knownProduct : null,
  );
  const screen = await render(
    <BarcodeCollectionWorkspace
      section="collect"
      onSectionChange={() => undefined}
      store={store}
      lookupProduct={lookup}
    />,
  );

  await expect
    .element(
      screen.getByText("Отсканируйте первый товар — он сразу появится здесь."),
    )
    .toBeVisible();
  await submitScanner(screen, knownProduct.barcode);
  await expect
    .element(screen.getByText("Coca-Cola Original 1 л"))
    .toBeVisible();
  await expect.element(screen.getByText("Уже есть в WayYaam")).toBeVisible();
  await submitScanner(screen, knownProduct.barcode);
  await expect.element(screen.getByText("×2")).toBeVisible();

  const saved = Array.from(store.values.values())[0];
  expect(saved.entries).toHaveLength(1);
  expect(saved.entries[0].scanCount).toBe(2);
  expect(lookup).toHaveBeenCalledTimes(1);
});

test("the existing master catalog remains available with its add-product action", async () => {
  const screen = await render(
    <PlatformProductDatabasePage
      catalog={<SharedProductCatalogPage mode="platform" demo />}
    />,
  );
  await screen.getByRole("button", { name: "Все товары" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Добавить товар" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Coca-Cola Original Taste" }))
    .toBeVisible();
});

test("bulk paste keeps only valid unique codes and the mobile scanner remains reachable", async () => {
  await page.viewport(372, 576);
  try {
    const store = createMemoryStore();
    const screen = await render(
      <BarcodeCollectionWorkspace
        section="collect"
        onSectionChange={() => undefined}
        store={store}
        lookupProduct={async () => null}
      />,
    );
    await screen.getByRole("button", { name: "Вставить список" }).click();
    await screen
      .getByLabelText(/Коды через перенос строки/)
      .fill("5449000054227\n4006381333931\n5449000054227\ninvalid");
    await expect
      .element(screen.getByText("Распознано валидных уникальных кодов:"))
      .toBeVisible();
    await screen.getByRole("button", { name: "Добавить в сессию" }).click();
    await expect.element(screen.getByText("5449000054227")).toBeVisible();
    await expect.element(screen.getByText("4006381333931")).toBeVisible();
    const scanner = screen
      .getByLabelText("Сканируйте следующий товар")
      .element()
      .getBoundingClientRect();
    expect(scanner.width).toBeGreaterThan(250);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    );
  } finally {
    await page.viewport(414, 896);
  }
});

test("XLSX barcode columns and processed ZIP products are parsed before import", async () => {
  const xlsx = new JSZip();
  xlsx.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c><c r="B1" t="inlineStr"><is><t>barcode</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Cola</t></is></c><c r="B2"><v>5449000054227</v></c></row></sheetData></worksheet>`,
  );
  const xlsxTable = await parseXlsxTable(
    await xlsx.generateAsync({ type: "arraybuffer" }),
  );
  expect(xlsxTable.suggestedBarcodeColumn).toBe(1);
  expect(xlsxTable.rows[0][1]).toBe("5449000054227");

  const catalog = new JSZip();
  catalog.file(
    "products.json",
    JSON.stringify({
      products: [
        {
          barcode: "5449000054227",
          name: "Coca-Cola Original 1 л",
          category: "Напитки",
          image: "images/5449000054227.webp",
          confidence: 0.98,
        },
      ],
    }),
  );
  catalog.file("images/5449000054227.webp", new Uint8Array([82, 73, 70, 70]));
  const blob = await catalog.generateAsync({ type: "blob" });
  const drafts = await parseProcessedCatalog(
    new File([blob], "wayyaam-products-import.zip", {
      type: "application/zip",
    }),
  );
  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    barcode: "5449000054227",
    title: "Coca-Cola Original 1 л",
    status: "ready",
  });
  expect(drafts[0].imageFile?.name).toBe("5449000054227.webp");
});
