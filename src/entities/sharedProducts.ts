export const GLOBAL_BARCODE_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * Converts GTIN-8, UPC-A, EAN-13 and GTIN-14 values to one 14 digit key.
 * Spaces and hyphens are treated as harmless scanner formatting. Any other
 * non-digit character makes the value ineligible for the shared catalog.
 */
export function normalizeGlobalBarcode(value: string | null | undefined): string | null {
  const compact = (value ?? '').trim().replace(/[\s-]+/g, '');

  if (!/^\d+$/.test(compact) || !GLOBAL_BARCODE_LENGTHS.has(compact.length)) {
    return null;
  }

  return compact.padStart(14, '0');
}

export function isValidGlobalBarcode(value: string | null | undefined): boolean {
  const compact = (value ?? '').trim().replace(/[\s-]+/g, '');

  if (!/^\d+$/.test(compact) || !GLOBAL_BARCODE_LENGTHS.has(compact.length)) {
    return false;
  }

  const checkDigit = Number(compact.at(-1));
  let sum = 0;

  for (let index = 0; index < compact.length - 1; index += 1) {
    const digit = Number(compact[index]);
    const distanceFromCheckDigit = compact.length - 1 - index;
    sum += digit * (distanceFromCheckDigit % 2 === 1 ? 3 : 1);
  }

  return (10 - (sum % 10)) % 10 === checkDigit;
}

export type SharedProductStatus = 'pending' | 'verified' | 'rejected' | 'archived';

export type SharedProduct = {
  id: string;
  title: string;
  brand: string | null;
  description: string | null;
  ingredients: string | null;
  allergens: string[];
  countryOfOrigin: string | null;
  netContentValue: number | null;
  netContentUnit: string | null;
  categoryId: string | null;
  categoryName: string | null;
  barcode: string;
  normalizedBarcode: string;
  imageUrl: string | null;
  version: number;
  status: SharedProductStatus;
};

export function findSharedProductByBarcode(
  products: readonly SharedProduct[],
  barcode: string | null | undefined
): SharedProduct | null {
  const normalizedBarcode = normalizeGlobalBarcode(barcode);
  if (!normalizedBarcode) return null;

  return products.find((product) => (
    product.normalizedBarcode === normalizedBarcode
    || normalizeGlobalBarcode(product.barcode) === normalizedBarcode
  )) ?? null;
}
