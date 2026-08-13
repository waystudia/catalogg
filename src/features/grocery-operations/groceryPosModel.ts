import type { Product } from '../../entities/models';

export type GroceryPosPaymentMethod = 'cash' | 'transfer';

export type GroceryPosPayment = {
  method: GroceryPosPaymentMethod;
  cashReceived: number;
  cashChange: number;
};

export function getWeightSaleMinimum(product: Product) {
  if (product.sale_unit !== 'weight') return 1;
  const legacyMinimumGrams = Math.round(Math.max(0, product.minimum_weight ?? 0) * 1000);
  return Math.max(1, product.minimum_quantity ?? (legacyMinimumGrams || product.quantity_step || 100));
}

export function calculateCashSettlement(total: number, rawReceived: string | number) {
  const normalized = typeof rawReceived === 'number' ? rawReceived : Number(rawReceived.replace(/\s/g, '').replace(',', '.'));
  const received = Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
  const roundedTotal = Math.max(0, Math.round(total));
  return {
    received,
    change: Math.max(0, Math.round(received - roundedTotal)),
    shortfall: Math.max(0, Math.round(roundedTotal - received))
  };
}

export function getCashQuickAmounts(total: number) {
  const normalizedTotal = Math.max(0, Math.ceil(total));
  const roundUp = (step: number) => Math.ceil(normalizedTotal / step) * step;
  return Array.from(new Set([normalizedTotal, roundUp(100), roundUp(500), roundUp(1000)]))
    .filter((value) => value > 0)
    .slice(0, 4);
}
