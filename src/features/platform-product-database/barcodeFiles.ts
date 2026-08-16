import JSZip from "jszip";
import {
  isValidGlobalBarcode,
  normalizeGlobalBarcode,
} from "../../entities/sharedProducts";
import type { BarcodeSession, ImportedProductDraft } from "./barcodeSessions";

export type ImportedTable = {
  headers: string[];
  rows: string[][];
  suggestedBarcodeColumn: number;
};

const decodeText = (buffer: ArrayBuffer) =>
  new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");

const splitDelimitedLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
};

export const parseDelimitedTable = (text: string): ImportedTable => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0)
    return { headers: ["barcode"], rows: [], suggestedBarcodeColumn: 0 };
  const delimiter = [";", ",", "\t"].sort(
    (left, right) => lines[0].split(right).length - lines[0].split(left).length,
  )[0];
  const parsed = lines.map((line) => splitDelimitedLine(line, delimiter));
  const firstRowLooksLikeHeader = parsed[0].some((cell) =>
    /barcode|штрих|gtin|ean|upc/i.test(cell),
  );
  const width = Math.max(...parsed.map((row) => row.length));
  const headers = firstRowLooksLikeHeader
    ? parsed[0]
    : Array.from({ length: width }, (_, index) =>
        index === 0 ? "barcode" : `Колонка ${index + 1}`,
      );
  const rows = firstRowLooksLikeHeader ? parsed.slice(1) : parsed;
  const suggestedBarcodeColumn = Math.max(
    0,
    headers.findIndex((header) => /barcode|штрих|gtin|ean|upc/i.test(header)),
  );
  return { headers, rows, suggestedBarcodeColumn };
};

const xlsxCellValue = (cell: Element, sharedStrings: string[]) => {
  const type = cell.getAttribute("t");
  if (type === "inlineStr")
    return cell.querySelector("is t")?.textContent?.trim() ?? "";
  const value = cell.querySelector("v")?.textContent?.trim() ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  return value;
};

export const parseXlsxTable = async (
  buffer: ArrayBuffer,
): Promise<ImportedTable> => {
  const zip = await JSZip.loadAsync(buffer);
  const worksheet = zip.file("xl/worksheets/sheet1.xml");
  if (!worksheet) throw new Error("В XLSX не найден первый лист");
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  const parser = new DOMParser();
  const sharedStrings = sharedStringsFile
    ? Array.from(
        parser
          .parseFromString(
            await sharedStringsFile.async("text"),
            "application/xml",
          )
          .querySelectorAll("si"),
      ).map((item) =>
        Array.from(item.querySelectorAll("t"))
          .map((text) => text.textContent ?? "")
          .join(""),
      )
    : [];
  const document = parser.parseFromString(
    await worksheet.async("text"),
    "application/xml",
  );
  const rows = Array.from(document.querySelectorAll("sheetData row")).map(
    (row) => {
      const cells = Array.from(row.querySelectorAll(":scope > c"));
      const values: string[] = [];
      cells.forEach((cell) => {
        const reference = cell.getAttribute("r") ?? "A1";
        const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
        let column = 0;
        for (const letter of letters)
          column = column * 26 + letter.charCodeAt(0) - 64;
        values[column - 1] = xlsxCellValue(cell, sharedStrings);
      });
      return values.map((value) => value ?? "");
    },
  );
  if (rows.length === 0)
    return { headers: ["barcode"], rows: [], suggestedBarcodeColumn: 0 };
  const headers = rows[0];
  const suggestedBarcodeColumn = headers.findIndex((header) =>
    /barcode|штрих|gtin|ean|upc/i.test(header),
  );
  if (suggestedBarcodeColumn >= 0)
    return { headers, rows: rows.slice(1), suggestedBarcodeColumn };
  return {
    headers: Array.from(
      { length: Math.max(...rows.map((row) => row.length)) },
      (_, index) => (index === 0 ? "barcode" : `Колонка ${index + 1}`),
    ),
    rows,
    suggestedBarcodeColumn: 0,
  };
};

export const readBarcodeTable = async (file: File): Promise<ImportedTable> => {
  if (/\.xlsx$/i.test(file.name))
    return parseXlsxTable(await file.arrayBuffer());
  return parseDelimitedTable(decodeText(await file.arrayBuffer()));
};

export const extractBarcodesFromText = (text: string) =>
  Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map((value) => value.trim())
        .filter(isValidGlobalBarcode),
    ),
  );

export const barcodesFromTable = (table: ImportedTable, column: number) =>
  Array.from(
    new Set(
      table.rows
        .map((row) => row[column]?.trim() ?? "")
        .filter(isValidGlobalBarcode),
    ),
  );

export const buildBarcodeExport = (session: BarcodeSession) => ({
  source: "WayYaam",
  session_id: session.id,
  session_name: session.name,
  merchant: session.merchant,
  created_at: session.createdAt,
  exported_at: new Date().toISOString(),
  total: session.entries.filter(
    (entry) => entry.status !== "known" && entry.status !== "imported",
  ).length,
  already_in_wayyaam: session.entries.filter(
    (entry) => entry.status === "known",
  ).length,
  barcodes: session.entries
    .filter((entry) => entry.status !== "known" && entry.status !== "imported")
    .map((entry) => ({
      barcode: entry.barcode,
      normalized_barcode: entry.normalizedBarcode,
      scan_count: entry.scanCount,
      wayyaam_status: entry.status,
      scanned_at: entry.firstScannedAt,
    })),
});

type RawImportedProduct = Record<string, unknown>;

const stringValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const parseProcessedCatalog = async (
  file: File,
): Promise<ImportedProductDraft[]> => {
  let payload: unknown;
  let zip: JSZip | null = null;
  if (/\.zip$/i.test(file.name)) {
    zip = await JSZip.loadAsync(file);
    const productsFile = zip.file("products.json");
    if (!productsFile) throw new Error("В архиве отсутствует products.json");
    payload = JSON.parse(await productsFile.async("text"));
  } else {
    payload = JSON.parse(await file.text());
  }
  const products = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { products?: unknown[] } | null)?.products)
      ? (payload as { products: unknown[] }).products
      : [];
  if (products.length === 0)
    throw new Error("В файле не найден список товаров");

  return Promise.all(
    products.map(async (raw, index): Promise<ImportedProductDraft> => {
      const product = raw as RawImportedProduct;
      const barcode = stringValue(product.barcode);
      const title = stringValue(product.name ?? product.title);
      const category = stringValue(product.category);
      const subcategory = stringValue(product.subcategory);
      const imagePath =
        stringValue(product.image ?? product.image_path) || null;
      const confidence = numberValue(product.confidence);
      const reasons: string[] = [];
      if (!isValidGlobalBarcode(barcode))
        reasons.push("Некорректный штрих-код");
      if (!title) reasons.push("Не указано название");
      if (!category) reasons.push("Не определена категория");
      if (!imagePath) reasons.push("Не найдено изображение");
      if (confidence === null || confidence < 0.75)
        reasons.push("Низкая уверенность");
      let imageFile: File | null = null;
      if (zip && imagePath) {
        const image = zip.file(imagePath.replace(/^\/?/, ""));
        if (image) {
          const blob = await image.async("blob");
          imageFile = new File(
            [blob],
            image.name.split("/").pop() ?? `${barcode}.webp`,
            { type: blob.type || "image/webp" },
          );
        } else {
          reasons.push("Изображение отсутствует в архиве");
        }
      }
      return {
        id: `${normalizeGlobalBarcode(barcode) ?? `invalid-${index}`}-${index}`,
        barcode,
        title,
        brand: stringValue(product.brand),
        category,
        subcategory,
        description: stringValue(product.description),
        netContentValue: numberValue(
          product.volume_ml ?? product.weight_g ?? product.net_content_value,
        ),
        netContentUnit:
          numberValue(product.volume_ml) !== null
            ? "ml"
            : numberValue(product.weight_g) !== null
              ? "g"
              : null,
        imagePath,
        imageFile,
        confidence,
        categoryId: null,
        status: reasons.length === 0 ? "ready" : "review",
        reasons,
        error: null,
      };
    }),
  );
};
