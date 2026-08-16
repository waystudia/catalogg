import { describe, expect, it } from "vitest";
import {
  barcodeSessionStats,
  createBarcodeSession,
} from "../../src/features/platform-product-database/barcodeSessions";
import {
  buildBarcodeExport,
  extractBarcodesFromText,
  parseDelimitedTable,
} from "../../src/features/platform-product-database/barcodeFiles";

describe("barcode collection session", () => {
  it("deduplicates pasted codes and ignores invalid values", () => {
    expect(
      extractBarcodesFromText(`
      5449000054227
      4006381333931; 5449000054227
      not-a-barcode 123
    `),
    ).toEqual(["5449000054227", "4006381333931"]);
  });

  it("detects a barcode column in semicolon CSV", () => {
    const table = parseDelimitedTable(
      "name;barcode;price\nCola;5449000054227;120\nTea;4006381333931;90",
    );
    expect(table.headers).toEqual(["name", "barcode", "price"]);
    expect(table.suggestedBarcodeColumn).toBe(1);
    expect(table.rows).toHaveLength(2);
  });

  it("keeps global identity separate from session metadata in the export", () => {
    const session = createBarcodeSession({
      name: "Финики · 16 августа",
      merchant: "Финики",
      now: new Date("2026-08-16T15:00:00.000Z"),
    });
    session.entries = [
      {
        barcode: "5449000054227",
        normalizedBarcode: "05449000054227",
        firstScannedAt: "2026-08-16T15:01:00.000Z",
        lastScannedAt: "2026-08-16T15:02:00.000Z",
        scanCount: 3,
        status: "known",
        knownProduct: null,
      },
    ];

    expect(barcodeSessionStats(session)).toEqual({
      unique: 1,
      newCount: 0,
      known: 1,
      repeats: 2,
    });
    expect(buildBarcodeExport(session)).toMatchObject({
      source: "WayYaam",
      merchant: "Финики",
      total: 0,
      already_in_wayyaam: 1,
      barcodes: [],
    });
  });
});
