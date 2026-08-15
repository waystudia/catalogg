# Plan: WayYaam Combined Order MVP

**Branch**: `codex/combined-order-mvp-20260815`
**Status**: Architecture audit and Slice 1 complete; Slice 2 in progress

## Goal

После успешного ресторанного заказа клиент может добавить отдельный заказ подходящего магазина к той же доставке. Клиент видит один общий заказ, а каждый бизнес видит только свой merchant order; курьер получает одну доставку с упорядоченными pickup stops и одним dropoff.

## Existing architecture decision

- `public.orders` остаётся единственной таблицей merchant orders; второй независимой системы заказов не создаём.
- `catalog_id` остаётся универсальным идентификатором продавца.
- Текущие restaurant/grocery checkout RPC, панели, статусы, Realtime и доставка расширяются additively.
- `deliveries.order_id` сохраняется как ссылка на основной заказ для обратной совместимости.
- Feature flag по умолчанию выключен; обычные заказы без addon не меняют поведение.
- До пилота необходимы координаты участвующих продавцов. Finik сейчас не подходит для включения production-флага, потому что его координаты не заполнены.

## Vertical slices

| № | Срез | Пользовательская ценность | Ключевая защита |
|---:|---|---|---|
| 1 | Order group foundation | Система умеет безопасно представить общий заказ, merchant orders, offer и delivery stops | Nullable compatibility columns, RLS, explicit grants, disabled flag |
| 2 | Secure primary-order grouping | Новый ресторанный заказ атомарно получает group/offer без задержки checkout | Existing idempotency and fallback remain valid; ownership from client session |
| 3 | Merchant operations | Ресторан и магазин работают с собственным заказом и ready estimate | Tenant-scoped RPC; no cross-merchant payload |
| 4 | Eligibility + quote + confirm | Клиент видит только магазины с допустимым крюком и получает стабильную цену | Server-side prefilter, one route matrix, revalidation, idempotency |
| 5 | Addon customer UX | Клиент выбирает товары без повторного адреса и видит общий итог | Separate addon cart; no automatic cart mixing |
| 6 | Combined delivery | Один курьер получает route with N stops | Generic `delivery_stops[]`; completed stops never reordered |
| 7 | Notifications + Realtime | Все участники своевременно видят разрешённые изменения | Minimal WhatsApp notification, in-app/push deduplication, RLS |
| 8 | Pilot release | 1 restaurant + 1–3 stores can be enabled safely | Scoped flag, production migration, real-origin regression gate |

## Slice 1 acceptance criteria

- [x] Existing `orders` is extended as merchant order with nullable `order_group_id`, `is_addon`, `source`, and `estimated_ready_at`.
- [x] `order_groups`, `delivery_stops`, `addon_offers`, `addon_quotes`, `order_group_events`, and `notifications` are generic and do not hardcode restaurant/store columns.
- [x] Existing `deliveries.order_id` remains valid; nullable `order_group_id` is additive.
- [x] Configuration contains every product limit from the specification and defaults to `enabled = false`.
- [x] New exposed tables have explicit grants, RLS, tenant/customer/courier/admin policies, and required indexes.
- [x] Confirm idempotency has a database unique constraint.
- [x] Existing checkout/order/delivery SQL contracts stay green.
- [x] Migration is additive and does not rewrite existing production rows destructively.

## Mandatory regression gates

```bash
node --test scripts/tests/combinedOrderFoundationContract.test.mjs
node --test scripts/tests/sqlOrderIdempotency.test.mjs scripts/tests/clientPlatformOrderContract.test.mjs scripts/tests/driverDeliveryDispatchContract.test.mjs
npm run test:unit
npm run lint
npm run typecheck
npm run build
```

Focused behavior modules must additionally complete RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR before release.

## Release constraints

- No feature-wide production enablement. Pilot activation is a separate scoped data change after coordinates and test actors are verified.
- No real customer order is created during verification.
- No automatic WhatsApp claim without a configured provider and delivery receipt; the current `wa.me` fallback can only become notification-only.
- No new map infrastructure for MVP; reuse the existing routing provider through one bounded server-side matrix request.
- Production migration must be additive, followed by RLS/grant/realtime checks and an immutable static release.

## Done

The feature is done only after the full user-specified restaurant → offer → store → courier → customer journey passes, ordinary orders remain unchanged, CI is green, the branch is pushed, and the scoped production release is verified on the real origin.
