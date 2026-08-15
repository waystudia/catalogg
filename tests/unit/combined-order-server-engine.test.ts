import { describe, expect, it } from "vitest";
import {
  calculateMerchantRouteEligibility,
  distanceToRouteCorridorKm,
  type RouteMatrix,
} from "../../supabase/functions/_shared/combinedOrderEngine";

const matrix = (distances: number[][], durations: number[][]): RouteMatrix => ({
  distances,
  durations,
});

describe("combined-order server route engine", () => {
  it("computes a route-corridor distance independently of barcode orientation or endpoint order", () => {
    expect(
      distanceToRouteCorridorKm(
        { lat: 43.318, lng: 45.698 },
        { lat: 43.322, lng: 45.705 },
        { lat: 43.32, lng: 45.7015 },
      ),
    ).toBeLessThan(0.05);
    expect(
      distanceToRouteCorridorKm(
        { lat: 43.322, lng: 45.705 },
        { lat: 43.318, lng: 45.698 },
        { lat: 43.32, lng: 45.7015 },
      ),
    ).toBeLessThan(0.05);
  });

  it("chooses store then restaurant when assembly fits restaurant readiness", () => {
    // Matrix indexes: primary, customer, store.
    const result = calculateMerchantRouteEligibility({
      matrix: matrix(
        [
          [0, 8000, 2200],
          [8000, 0, 6500],
          [2200, 6500, 0],
        ],
        [
          [0, 900, 240],
          [900, 0, 720],
          [240, 720, 0],
        ],
      ),
      primaryIndex: 0,
      customerIndex: 1,
      storeIndex: 2,
      nowMs: Date.parse("2026-08-15T10:00:00Z"),
      primaryReadyAtMs: Date.parse("2026-08-15T10:11:00Z"),
      storeAssemblyMinutes: 3,
      limits: {
        maxExtraDistanceKm: 3,
        maxExtraTimeMinutes: 10,
        maxPostMainPickupDelayMinutes: 3,
      },
    });

    expect(result).toMatchObject({
      eligible: true,
      sequence: ["store", "primary", "customer"],
      extraDistanceKm: 2.2,
    });
  });

  it("rejects a large detour and a slow pickup after hot food", () => {
    const detour = calculateMerchantRouteEligibility({
      matrix: matrix(
        [
          [0, 5000, 5000],
          [5000, 0, 5000],
          [5000, 5000, 0],
        ],
        [
          [0, 600, 600],
          [600, 0, 600],
          [600, 600, 0],
        ],
      ),
      primaryIndex: 0,
      customerIndex: 1,
      storeIndex: 2,
      nowMs: 0,
      primaryReadyAtMs: 0,
      storeAssemblyMinutes: 0,
      limits: {
        maxExtraDistanceKm: 3,
        maxExtraTimeMinutes: 10,
        maxPostMainPickupDelayMinutes: 3,
      },
    });
    expect(detour).toEqual({ eligible: false, reason: "detour_too_large" });

    const hotDelay = calculateMerchantRouteEligibility({
      matrix: matrix(
        [
          [0, 5000, 500],
          [5000, 0, 4700],
          [500, 4700, 0],
        ],
        [
          [0, 600, 240],
          [600, 0, 560],
          [240, 560, 0],
        ],
      ),
      primaryIndex: 0,
      customerIndex: 1,
      storeIndex: 2,
      nowMs: 0,
      primaryReadyAtMs: 0,
      storeAssemblyMinutes: 8,
      limits: {
        maxExtraDistanceKm: 3,
        maxExtraTimeMinutes: 10,
        maxPostMainPickupDelayMinutes: 3,
      },
      allowedSequences: [["primary", "store", "customer"]],
    });
    expect(hotDelay).toEqual({ eligible: false, reason: "hot_food_delay" });
  });

  it("rejects incomplete router matrices instead of inventing a delivery price", () => {
    expect(
      calculateMerchantRouteEligibility({
        matrix: matrix([[0]], [[0]]),
        primaryIndex: 0,
        customerIndex: 1,
        storeIndex: 2,
        nowMs: 0,
        primaryReadyAtMs: 0,
        storeAssemblyMinutes: 3,
        limits: {
          maxExtraDistanceKm: 3,
          maxExtraTimeMinutes: 10,
          maxPostMainPickupDelayMinutes: 3,
        },
      }),
    ).toEqual({ eligible: false, reason: "route_unavailable" });
  });
});
