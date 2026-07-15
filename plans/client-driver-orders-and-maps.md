# Plan: Client Order History, Driver Offers, and Chechnya Maps

**Branch**: current workspace
**Status**: Active — Slices 4 and 5 implemented and verified; driver pickup RPC deployed to linked Supabase; awaiting user review

## Goal

Clients can reopen persisted orders from their profile and track the restaurant and driver, while drivers can inspect, accept, decline, and navigate real delivery offers on an in-app road map focused on the Chechen Republic.

## Acceptance Criteria

- [ ] A successfully saved restaurant order is recorded in the current client device profile and remains visible after refresh/restart; unsaved checkout attempts never appear in history.
- [ ] `/profile/orders` shows real recorded orders grouped by current, completed, and canceled state, and `/profile/orders/:orderId` opens a client-owned detail screen instead of redirecting to a restaurant catalog.
- [ ] Client order detail shows live order/payment/delivery status, ordered items and total, restaurant address/location, and assigned driver name/phone/current location when available.
- [ ] A driver can open every visible offer by its delivery ID, including after a direct notification/deep link or realtime refresh, and sees delivery compensation, order total, restaurant (point A), client destination (point B), and no client PII before acceptance beyond the delivery destination already exposed by the dispatch contract.
- [ ] Accept assigns the delivery to the authenticated driver; decline removes it only for that driver and keeps it available to other eligible drivers.
- [x] The delivery-location picker supports an explicit city/village search constrained to the Chechen Republic, fresh high-accuracy browser geolocation, manual pin selection, and the existing visible low-accuracy warning.
- [x] Client and driver maps provide switchable detailed street and satellite/hybrid layers, interactive pan/zoom, settlements/streets, and an actual road route when the routing service succeeds; usable points/straight fallback remain when it fails.
- [x] The driver always has explicit Yandex Maps actions for “Маршрут до ресторана” and “Маршрут до клиента”; the restaurant action is primary before pickup, and the client action becomes primary after QR handoff confirmation or “Я взял заказ”.
- [x] Public OSM attribution is visible, search is submit-only and throttled/cached, provider endpoints are configurable, and no background/bulk geocoding or tile prefetch is introduced.

## Slices

Every slice follows RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. No production code without a failing test.

### Slice 1: Client opens an order from profile without leaving the client platform

**Value**: The client can inspect an existing order and return to the main/profile navigation without being trapped in Rizih's catalog.
**Path**: `/profile/orders` card -> `/profile/orders/:orderId` -> persisted order lookup -> client detail UI -> profile/main navigation.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `front-end-testing`, `react-testing`, `catalogg-working-order`.
**Acceptance criteria**: The selected order ID is preserved; a missing ID shows a not-found state; the client detail route never passes through `RestaurantRouteRedirect`; status, items, amount, restaurant action, and optional driver block are visible.
**RED**: Add routing/logic/browser tests that reproduce the current `/r/:slug/order/:id` catalog redirect and require `/profile/orders/:id` detail behavior, including a missing ID.
**GREEN**: Add the nested profile route and render the existing local order through a dedicated client detail screen; update order-card links.
**MUTATE**: Mutate route matching, ID equality, and optional driver rendering.
**KILL MUTANTS**: Strengthen equal/not-equal ID and driver present/absent cases.
**REFACTOR**: Assess shared detail/status presentation only after mutation verification.
**Done when**: Criteria pass and the user reviews the slice and mutation report.

### Slice 2: Saved checkout orders persist as real client history

**Value**: The client sees orders actually created in Supabase after reload instead of demo-only history.
**Path**: Public/client checkout -> real order ID -> local access reference -> public status RPC hydration -> `/profile/orders` and detail -> realtime updates.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `catalogg-working-order`.
**Acceptance criteria**: Only a real returned order ID creates a reference; duplicate saves are idempotent; references survive restart; invalid/deleted orders fail independently without hiding valid history; demo orders are not injected into a new profile.
**RED**: Add storage contract and API-mapping tests for save, dedupe, reload, partial RPC failure, and status/driver mapping.
**GREEN**: Add a shared order-reference store, record references in both successful checkout paths, hydrate them via existing public order-status RPCs, and merge them into client state.
**MUTATE**: Mutate dedupe equality, invalid-entry filtering, status mapping, and save-before-ID behavior.
**KILL MUTANTS**: Add boundary/branch tests for empty IDs, duplicate IDs, and one failed status request among valid requests.
**REFACTOR**: Assess whether shared order mapping removes duplicated status conversion knowledge.
**Done when**: Criteria pass and the user reviews the slice and mutation report.

### Slice 3: Driver reliably opens, accepts, or declines a priced offer

**Value**: An eligible driver can make a clear decision from point A/B and delivery compensation without a dead card.
**Path**: Dispatch/realtime/deep link -> offer lookup -> offer detail -> accept or authenticated per-driver decline RPC -> refreshed dashboard.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `front-end-testing`, `react-testing`.
**Acceptance criteria**: Deep-linked offers resolve by delivery ID; missing/withdrawn offers show a clear state; delivery compensation is primary and order total is secondary; accept assigns; decline records only the viewer driver's response and removes the offer from that driver's feed.
**RED**: Add UI/API/SQL contract tests reproducing the dead-card path, fee-vs-total error, and decline isolation rule.
**GREEN**: Stabilize selected-offer loading, correct price labels, implement decline persistence/RPC/API, and refresh/navigate after either decision.
**MUTATE**: Mutate selected ID matching, compensation selection, authorization, and `not exists declined` filtering.
**KILL MUTANTS**: Add tests for another driver still seeing the declined offer and for an accepted/withdrawn deep link.
**REFACTOR**: Assess offer decision-state extraction and shared loading/error presentation.
**Done when**: Criteria pass and the user reviews the slice and mutation report.

### Slice 4: Client searches and selects a precise Chechnya delivery point on street or satellite imagery

**Value**: The client can find a city/village, locate themselves, or set a manual point without losing delivery precision metadata.
**Path**: Address screen -> explicit search/geolocation/map click -> normalized coordinates and address -> checkout draft/address persistence.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `front-end-testing`, `react-testing`, `delivery-location-precision`.
**Acceptance criteria**: Search runs only on submit, is bounded/preferred to Chechnya and rejects out-of-region results; repeated identical queries use a cache; requests are rate-limited; GPS still uses `watchPosition` and best reading; manual choice sets accuracy to `null`; users can switch between a labeled street layer and satellite/hybrid imagery without losing the selected point or zoom.
**RED**: Add geocoder request/result/cache/region tests and browser interaction tests for search, locate, result selection, and manual pin.
**GREEN**: Add configurable geocoder adapter and search UI to the shared picker while preserving shared location precision helpers.
**MUTATE**: Mutate region bounds, rate boundary, cache key, result validity, and manual accuracy reset.
**KILL MUTANTS**: Add inside/outside/boundary coordinates and repeated-query cases.
**REFACTOR**: Assess provider adapter naming and map control structure.
**Done when**: Criteria pass and the user reviews the slice and mutation report.

### Slice 5: Driver and client see a real in-app road route with explicit Yandex handoff

**Value**: Drivers can follow the delivery path inside WayCatalog, while clients can understand restaurant-driver-destination progress.
**Path**: Order/delivery coordinates and delivery status -> configurable routing adapter -> GeoJSON road geometry/distance/duration -> shared street/satellite map -> explicit Yandex restaurant/client actions.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `front-end-testing`, `react-testing`, `delivery-location-precision`.
**Acceptance criteria**: The map draws returned road geometry; route summary uses routed distance/duration; driver-to-restaurant and restaurant-to-client legs switch with delivery status; network/no-route errors retain markers and a straight fallback; route calls are cached and made only when endpoints change; “Маршрут до ресторана” and “Маршрут до клиента” remain separately available in Yandex Maps, with the current workflow leg visually primary.
**RED**: Add layer URL, route URL/parsing/cache/failure tests and browser tests for satellite/street switching, geometry, both Yandex actions, and current-leg selection.
**GREEN**: Add configurable street/satellite tile sources and an OSRM-compatible adapter, feed road geometry into the shared map, and expose both Yandex route actions in driver workflow screens.
**MUTATE**: Mutate tile coordinate ordering, route coordinate order, current-leg status conditions, cache keys, and fallback branch.
**KILL MUTANTS**: Add asymmetric tile/route coordinates, status transitions around pickup, and rejected/empty route responses.
**REFACTOR**: Assess shared map projection and route state organization.
**Done when**: Criteria pass and the user reviews the slice and mutation report.

## Pre-PR Quality Gate

Before each slice handoff:

1. Targeted RED/GREEN tests pass.
2. Targeted Stryker mutation run is reported; valuable survivors are killed.
3. Required order/idempotency/location SQL and contract tests pass.
4. `npm run lint`, `npm run typecheck`, and `npm run build` pass.
5. Generated `dist` assets are verified without deleting unrelated user changes.

## Deployment Notes

- The `confirm_driver_pickup(uuid)` function from `supabase/waycatalog_delivery.sql` was applied to the linked Supabase project on 2026-07-15 and verified as executable by `authenticated` with `search_path=public`.
- OSM public services are best-effort. Tile/geocoder/router base URLs must remain configurable so production can move to a hosted or self-hosted provider without a client release.
- Nominatim public search must remain explicit-submit only, at most one request per second per application, cached, visibly attributed, and suitable only for moderate traffic.
