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

const cameraDecoder = vi.hoisted(() => ({
  detectedValue: "",
  stop: vi.fn(),
  preload: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
}));

vi.mock(
  "../../src/features/grocery-operations/browserBarcodeDecoder",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/features/grocery-operations/browserBarcodeDecoder")
      >();
    return {
      ...actual,
      preloadBrowserBarcodeDecoder: cameraDecoder.preload,
      startBrowserBarcodeDecoder: cameraDecoder.start.mockImplementation(
        async (
          _video: HTMLVideoElement,
          onDetected: (barcode: string) => boolean,
        ) => {
          const controls = { stop: cameraDecoder.stop };
          if (
            cameraDecoder.detectedValue &&
            onDetected(cameraDecoder.detectedValue)
          )
            controls.stop();
          return controls;
        },
      ),
    };
  },
);

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

test("HID scans keep only the first new barcode and never list known or repeated products", async () => {
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
  await expect.element(screen.getByText("Уже есть в WayYaam")).toBeVisible();
  await expect
    .element(
      screen
        .getByRole("table", { name: "Собранные штрих-коды" })
        .getByText("Coca-Cola Original 1 л"),
    )
    .not.toBeInTheDocument();

  const newBarcode = "4006381333931";
  await submitScanner(screen, newBarcode);
  await expect.element(screen.getByText(newBarcode)).toBeVisible();
  await submitScanner(screen, newBarcode);
  await expect.element(screen.getByText("Уже отсканирован")).toBeVisible();
  await expect.element(screen.getByText("×2")).not.toBeInTheDocument();

  const saved = Array.from(store.values.values())[0];
  expect(saved.entries).toHaveLength(1);
  expect(saved.entries[0]).toMatchObject({
    barcode: newBarcode,
    scanCount: 1,
    status: "new",
  });
  expect(lookup).toHaveBeenCalledTimes(2);
});

test("known rows left by an older local session stay hidden from the scan list", async () => {
  const store = createMemoryStore();
  const session: BarcodeSession = {
    id: "legacy-session",
    name: "Старая сессия",
    merchant: "",
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    status: "draft",
    entries: [
      {
        barcode: knownProduct.barcode,
        normalizedBarcode: knownProduct.normalizedBarcode,
        firstScannedAt: "2026-08-16T12:00:00.000Z",
        lastScannedAt: "2026-08-16T12:00:00.000Z",
        scanCount: 2,
        status: "known",
        knownProduct,
      },
      {
        barcode: "4006381333931",
        normalizedBarcode: "04006381333931",
        firstScannedAt: "2026-08-16T12:01:00.000Z",
        lastScannedAt: "2026-08-16T12:01:00.000Z",
        scanCount: 1,
        status: "new",
        knownProduct: null,
      },
    ],
  };
  store.values.set(session.id, session);

  const screen = await render(
    <BarcodeCollectionWorkspace
      section="collect"
      onSectionChange={() => undefined}
      store={store}
      lookupProduct={async () => null}
    />,
  );
  const table = screen.getByRole("table", { name: "Собранные штрих-коды" });
  await expect.element(table.getByText("4006381333931")).toBeVisible();
  await expect
    .element(table.getByText(knownProduct.barcode))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("×2")).not.toBeInTheDocument();
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

test("the phone camera opens on demand and adds a decoded EAN to the active session", async () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const stopTrack = vi.fn();
  const stream = new MediaStream();
  vi.spyOn(stream, "getTracks").mockReturnValue([
    { stop: stopTrack } as unknown as MediaStreamTrack,
  ]);
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  cameraDecoder.detectedValue = "4600494600012";
  cameraDecoder.preload.mockClear();
  cameraDecoder.start.mockClear();
  cameraDecoder.stop.mockClear();
  await page.viewport(390, 844);

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

    await expect
      .element(screen.getByText(/USB\/Bluetooth‑сканер готов/))
      .toBeVisible();
    await screen.getByRole("button", { name: "Сканировать камерой" }).click();

    await expect.poll(() => getUserMedia.mock.calls.length).toBe(1);
    await expect.poll(() => cameraDecoder.start.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("4600494600012")).toBeVisible();
    await expect
      .element(screen.getByText(/За этот запуск распознано: 1/))
      .toBeVisible();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: { ideal: "environment" },
        }),
      }),
    );
    const dialog = screen
      .getByRole("dialog", {
        name: "Сканирование камерой",
      })
      .element();
    expect(dialog.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    );

    await screen.getByRole("button", { name: "Закрыть камеру" }).click();
    expect(stopTrack.mock.calls.length).toBeGreaterThan(0);
  } finally {
    cameraDecoder.detectedValue = "";
    await page.viewport(414, 896);
    play.mockRestore();
    if (originalMediaDevices)
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  }
});

test("a denied phone camera shows actionable permission guidance without hiding HID input", async () => {
  const originalMediaDevices = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );
  const getUserMedia = vi
    .fn()
    .mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  cameraDecoder.detectedValue = "";

  try {
    const screen = await render(
      <BarcodeCollectionWorkspace
        section="collect"
        onSectionChange={() => undefined}
        store={createMemoryStore()}
        lookupProduct={async () => null}
      />,
    );
    await screen.getByRole("button", { name: "Сканировать камерой" }).click();
    await expect
      .element(screen.getByText(/Доступ к камере запрещён/))
      .toBeVisible();
    await screen.getByRole("button", { name: "Готово" }).click();
    await expect
      .element(screen.getByLabelText("Сканируйте следующий товар"))
      .toBeVisible();
  } finally {
    if (originalMediaDevices)
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    else Reflect.deleteProperty(navigator, "mediaDevices");
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
