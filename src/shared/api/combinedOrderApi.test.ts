import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapCombinedOrderAddonConfirmation,
  mapCombinedOrderAddonOffer,
  mapCombinedOrderAddonQuote,
  mapCombinedOrderSummary,
} from "./combinedOrderModels";

describe("combined order API mapping", () => {
  it("maps only valid offer merchants", () => {
    const offer = mapCombinedOrderAddonOffer({
      available: true,
      orderGroupId: "group-1",
      addonDeliveryFee: 40,
      merchants: [
        {
          id: "merchant-1",
          slug: "finik",
          name: "Финик",
          business_type: "grocery",
          extraTimeMinutes: 4.2,
        },
        {},
      ],
    });
    assert.equal(offer?.available, true);
    assert.equal(offer?.merchants.length, 1);
    assert.equal(offer?.merchants[0]?.extraTimeMinutes, 4.2);
  });

  it("maps server-authoritative quote and confirmation totals", () => {
    assert.deepEqual(
      mapCombinedOrderAddonQuote({
        quote_id: "quote-1",
        quoteToken: "secret",
        merchantId: "merchant-1",
        items_subtotal: 260,
        addon_delivery_fee: 40,
        total: 300,
        expires_at: "2026-08-15T12:00:00Z",
      }),
      {
        quoteId: "quote-1",
        quoteToken: "secret",
        merchantId: "merchant-1",
        itemsSubtotal: 260,
        addonDeliveryFee: 40,
        total: 300,
        expiresAt: "2026-08-15T12:00:00Z",
      },
    );
    assert.equal(
      mapCombinedOrderAddonConfirmation({
        order_group_id: "group-1",
        merchant_order_id: "order-2",
        delivery_id: "delivery-1",
        merchant_subtotal: 260,
        base_delivery_fee: 150,
        addon_delivery_fee: 40,
        grand_total: 1100,
        idempotent: false,
      })?.grandTotal,
      1100,
    );
  });

  it("maps the customer-safe grouped order read model", () => {
    const summary = mapCombinedOrderSummary({
      order_group_id: "group-1",
      primary_order_id: "order-1",
      status: "active",
      merchant_subtotal: 910,
      base_delivery_fee: 150,
      addon_delivery_fee: 40,
      grand_total: 1100,
      merchant_orders: [
        {
          id: "order-1",
          merchant_id: "restaurant-1",
          merchant_name: "Мангал",
          status: "preparing",
          subtotal: 650,
          is_addon: false,
          items: [],
        },
        {
          id: "order-2",
          merchant_id: "store-1",
          merchant_name: "Финик",
          status: "ready",
          subtotal: 260,
          is_addon: true,
          items: [],
        },
      ],
      delivery: {
        id: "delivery-1",
        status: "planning",
        route_version: 2,
        stops: [
          {
            id: "stop-1",
            type: "pickup",
            sequence: 1,
            status: "pending",
            merchant_name: "Финик",
          },
        ],
      },
    });
    assert.equal(summary?.merchantOrders.length, 2);
    assert.equal(summary?.merchantOrders[1]?.isAddon, true);
    assert.equal(summary?.delivery?.stops[0]?.merchantName, "Финик");
    assert.equal(summary?.grandTotal, 1100);
  });
});
