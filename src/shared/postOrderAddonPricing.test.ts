import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePostOrderAddonFeeTiers } from "./postOrderAddonPricing";

describe("post-order addon fee tier normalization", () => {
  it("sorts tiers and normalizes distance and ruble values", () => {
    assert.deepEqual(
      normalizePostOrderAddonFeeTiers([
        { maxExtraDistanceKm: 3.04, fee: 99.8 },
        { maxExtraDistanceKm: 0.96, fee: 40.2 },
        { maxExtraDistanceKm: 2, fee: 50 },
      ]),
      [
        { maxExtraDistanceKm: 1, fee: 40 },
        { maxExtraDistanceKm: 2, fee: 50 },
        { maxExtraDistanceKm: 3, fee: 100 },
      ],
    );
  });
});
