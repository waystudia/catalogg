import type { Product } from '../../entities/models';
import type { GroceryReceivingLineInput } from '../../shared/api/groceryInventoryApi';

export function getProductInventoryQuantity(product: Product) {
  return Math.max(0, product.stock_quantity ?? product.current_stock ?? product.stock_count ?? 0);
}

export function getProductScanIncrement(product: Product) {
  return product.sale_unit === 'weight' ? Math.max(1, product.quantity_step ?? 100) : 1;
}

export function formatInventoryQuantity(product: Product, quantity = getProductInventoryQuantity(product)) {
  if (product.sale_unit === 'weight') {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(quantity / 1000)} кг`;
  }
  return `${new Intl.NumberFormat('ru-RU').format(quantity)} шт`;
}

export function getProductMargin(product: Product) {
  const cost = Math.max(0, product.cost_price ?? 0);
  const sale = Math.max(0, product.price);
  const amount = sale - cost;
  const percent = sale > 0 ? Math.round((amount / sale) * 100) : 0;
  return { amount, percent };
}

export function applyReceivingLines(products: readonly Product[], lines: readonly GroceryReceivingLineInput[]) {
  const linesByProduct = new Map(lines.map((line) => [line.productId, line]));
  return products.map((product) => {
    const line = linesByProduct.get(product.id);
    if (!line) return product;
    const stockQuantity = getProductInventoryQuantity(product) + Math.max(0, Math.round(line.quantity));
    const stockCount = product.sale_unit === 'weight' ? Math.ceil(stockQuantity / 1000) : stockQuantity;
    return {
      ...product,
      price: line.unitPrice > 0 ? Math.round(line.unitPrice) : product.price,
      cost_price: Math.max(0, Math.round(line.unitCost)),
      minimum_stock: Math.max(0, Math.round(line.minimumStock)),
      stock_quantity: stockQuantity,
      stock_count: stockCount,
      current_stock: stockCount,
      daily_stock: stockCount,
      is_hidden: false
    };
  });
}
