---
name: catalogg-driver-map
description: Preserve and debug the WayCatalog driver delivery map. Use when changing DeliveryTrackingMap, driver map/order routes, map tiles, route geometry, driver heading, touch zoom/rotation, point popups, or the decorative DriverMapPreview fallback.
---

# WayCatalog Driver Map

Use one geographic coordinate system for tiles, route geometry, restaurant, driver, and client. The interactive map is `src/shared/DeliveryTrackingMap.tsx`; `DriverMapPreview` is only an unavailable-data fallback and must not replace a valid map.

## Inspect First

- `src/shared/DeliveryTrackingMap.tsx`
- `src/shared/delivery-tracking-map.css`
- `src/shared/deliveryMap.ts`
- `src/shared/deliveryNavigation.ts`
- `src/pages/driver/DriverApp.tsx`
- `src/features/order/orderLifecycle.ts`
- `src/shared/deliveryMap.test.ts`

## Invariants

- Resolve `/driver/map/:deliveryId` from all dashboard offers, even when the driver becomes offline after opening an order.
- Project tiles, route, and markers from the same `center`, `zoom`, and `mapSize`; never position geographic elements with decorative CSS percentages.
- Keep enough offscreen raster tiles for rotation and overlap adjacent tiles by one pixel to avoid seams.
- Pinch changes zoom continuously. Two-finger angle changes manual map rotation. Releasing one pointer must not cancel the remaining pointer.
- In follow mode, center on the driver and rotate the map so the current route is ahead. The driver uses a navigation arrow, not a location pin.
- The reset control clears manual rotation, restores the driver-centered view when driver coordinates exist, and otherwise fits restaurant and client.
- Point buttons focus the map and show role, label, address, phone, and comments when available.
- Clear stale road geometry immediately when route points change; asynchronous responses must not replace a newer route.
- Do not fabricate restaurant or client coordinates. Show the fallback only when required coordinates are genuinely unavailable.

## Verification

Run:

```bash
./node_modules/.bin/tsx --test src/shared/deliveryMap.test.ts src/features/order/orderLifecycle.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/shared/DeliveryTrackingMap.tsx src/shared/deliveryMap.ts src/pages/driver/DriverApp.tsx
node ./node_modules/vite/bin/vite.js build
```

Then inspect `/driver/map/:deliveryId` and `/driver/orders/:deliveryId` at 340 px and desktop widths. Verify drag, pinch zoom, two-finger rotation, reset, layer switching, marker popups, route alignment, and that tiles do not expose blank seams.
