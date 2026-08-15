import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientDish } from "../client-platform/types";
import {
  calculateAddonCartSubtotal,
  toCombinedOrderAddonItems,
  updateAddonCartLine,
} from "./addonCart";

const dish = (overrides: Partial<ClientDish> = {}): ClientDish => ({
  id: "product-1",
  restaurantSlug: "finik",
  categorySlug: "drinks",
  name: "Вода",
  description: "",
  price: 100,
  imageUrl: "",
  tags: [],
  isPopular: false,
  isAvailable: true,
  stockCount: 10,
  stockQuantity: 10,
  isUnlimited: false,
  saleUnit: "piece",
  quantityUnit: "piece",
  priceBasisQuantity: 1,
  minimumQuantity: 1,
  quantityStep: 1,
  allowSubstitution: false,
  sku: "",
  barcode: "",
  ...overrides,
});

describe("combined-order addon cart", () => {
  it("keeps addon items isolated and respects stock", () => {
    const product = dish({ stockQuantity: 2 });
    let lines = updateAddonCartLine([], product, 1);
    lines = updateAddonCartLine(lines, product, 1);
    lines = updateAddonCartLine(lines, product, 1);
    assert.deepEqual(lines, [{ productId: "product-1", quantity: 2 }]);
    assert.deepEqual(toCombinedOrderAddonItems(lines, [product]), [
      { productId: "product-1", quantity: 2 },
    ]);
    assert.equal(calculateAddonCartSubtotal(lines, [product]), 200);
  });

  it("quotes weighted goods with exact requested quantity", () => {
    const product = dish({
      saleUnit: "weight",
      quantityUnit: "gram",
      price: 470,
      priceBasisQuantity: 1000,
      minimumQuantity: 250,
      quantityStep: 50,
      stockQuantity: 4_000,
    });
    const lines = updateAddonCartLine([], product, 1);
    assert.deepEqual(lines, [{ productId: "product-1", quantity: 250 }]);
    assert.deepEqual(toCombinedOrderAddonItems(lines, [product]), [
      {
        productId: "product-1",
        quantity: 1,
        requestedQuantity: 250,
      },
    ]);
    assert.equal(calculateAddonCartSubtotal(lines, [product]), 118);
  });

  it("removes a line when decrementing below its minimum", () => {
    const product = dish();
    assert.deepEqual(
      updateAddonCartLine(
        [{ productId: product.id, quantity: 1 }],
        product,
        -1,
      ),
      [],
    );
  });
});
