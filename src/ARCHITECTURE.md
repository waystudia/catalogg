# WayCatalog frontend boundaries

The frontend is organised by product area. New UI and business rules should be placed in the owning feature instead of `app/App.tsx`.

## Entry points

- `main.tsx` — routing and lazy application entry points only.
- `app/App.tsx` — restaurant composition and route-level state. Do not add standalone screens or reusable domain helpers here.

## Feature ownership

- `features/checkout/` — checkout form, customer delivery data and cart submission UI.
- `features/restaurant-settings/` — settings screens plus catalog/stock/backup model helpers.
- `features/restaurant-admin/` — dashboard workspace, order details and order presentation rules.
- `features/design-settings/` — design screens and the design editor.
- `features/dish-editor/` — dish editor, variants, upload and editor styles.
- `features/order/` — order lifecycle and routing rules.
- `features/client-platform/` — client-side platform state.

## Pages

Large role applications live under `pages/<role>/`. When a page grows, split it into:

1. `components/` for visual blocks;
2. `model/` for state and selectors;
3. `api/` only when the API belongs exclusively to that page;
4. a page-local stylesheet imported by the feature/page entry.

Shared Supabase access remains in `shared/api/` or `shared/supabase.ts`; components must not duplicate queries.

## Change rule

When changing a restaurant setting, start in `features/restaurant-settings/`. When changing order labels, filters or compact formatting, start in `features/restaurant-admin/orderPresentation.ts`. Route composition is the only reason to touch `app/App.tsx`.

## Size guard

`scripts/tests/appArchitectureContract.test.mjs` protects the composition root from silently becoming monolithic again. It currently enforces a 3,100-line transition budget and verifies that extracted screens are not copied back into `App.tsx`.

This is a transition limit, not a target. Remaining public catalog screens should continue moving into `features/catalog/` in behaviour-preserving slices. Large role applications under `pages/` should be split independently; they must not be mixed into the restaurant refactor.
