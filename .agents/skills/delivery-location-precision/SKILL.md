---
name: delivery-location-precision
description: Preserve WayCatalog client delivery geolocation precision. Use when changing checkout address, map picker, delivery coordinates, browser geolocation, GPS accuracy, client platform order address, or public restaurant delivery location code.
---

# Delivery Location Precision

## Purpose

Protect the customer delivery location flow from regressions where the browser returns a coarse network position instead of the best GPS reading. This skill applies to both public restaurant checkout and the client platform address/profile checkout.

## Inspect First

Before editing delivery location behavior, inspect the current contracts in these files:

- `src/shared/deliveryLocation.ts`
- `src/shared/deliveryLocation.test.ts`
- `scripts/tests/clientLocationPrecisionContract.test.mjs`
- `src/app/App.tsx`
- `src/pages/client-platform/ClientPlatformApp.tsx`
- `src/shared/DeliveryMapPicker.tsx`

## Required Invariants

- Use the shared `DELIVERY_TARGET_ACCURACY_M`, `DELIVERY_LOCATION_TIMEOUT_MS`, and `DELIVERY_GEOLOCATION_OPTIONS` from `src/shared/deliveryLocation.ts`.
- Keep `DELIVERY_TARGET_ACCURACY_M = 10` unless product explicitly changes the precision target.
- Keep `DELIVERY_LOCATION_TIMEOUT_MS = 20_000` unless product explicitly changes the wait time.
- Keep `DELIVERY_GEOLOCATION_OPTIONS.maximumAge = 0` so cached browser coordinates are not accepted for delivery placement.
- Use `navigator.geolocation.watchPosition` for delivery GPS capture. Do not use `getCurrentPosition` for customer delivery address precision.
- Keep the best reading with `chooseMoreAccuratePosition`; never replace a more precise coordinate with a weaker later reading.
- Stop watching when the target accuracy is reached, when the timeout expires, when an error arrives after at least one usable reading, or when the component unmounts.
- Save coordinates through `normalizeDeliveryCoordinates` before persisting them to order or draft state.
- Manual map selection must set `deliveryAccuracyM` to `null`; do not label a manually moved pin as GPS accuracy.
- If the best available GPS reading is worse than `DELIVERY_TARGET_ACCURACY_M`, save it only with a visible warning asking the customer to check the address/point.

## Validation

Run these checks after changing delivery location code:

```bash
npx tsx --test src/shared/deliveryLocation.test.ts
node --test scripts/tests/clientLocationPrecisionContract.test.mjs
npm run lint
npm run typecheck
npm run build
```

If `npm run build` changes tracked `dist` files, keep those generated updates with the source change.
