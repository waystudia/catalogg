# Plan: WayYaam Multi-Business Platform

**Branch**: `codex/multi-business-architecture-20260812`
**Status**: Slice 1 committed locally; database-backed acceptance remains pending

## Goal

Суперадмин безопасно подключает разные типы бизнеса к общей платформе WayYaam, а клиенты, сотрудники, водители и финансовая отчётность используют единые проверяемые заказы без регрессии ресторанного пути.

## Parent

Платформа WayYaam должна поддерживать grocery, flowers, gifts, household и регулируемую pharmacy-модель через общие tenant, catalog, order, fulfillment, delivery и finance-модули, сохраняя существующие рестораны.

## Recommended First Slice

Суперадмин создаёт draft-продуктовый магазин с владельцем из проверенного бизнес-типа, после чего владелец входит в тот же кабинет и видит корректную магазинную терминологию, а опубликованные рестораны продолжают работать без изменений.

**Почему первым:** этот walking skeleton проверяет самые рискованные границы — реестр типов, атомарный onboarding, membership, маршрутизацию входа, tenant isolation и compatibility — до весовых товаров, чата и финансов.

## Overall Acceptance Criteria

- [ ] Каждый новый объект имеет проверяемый tenant scope.
- [ ] Полномочия enforced сервером/RLS, а не только UI.
- [ ] Restaurant golden path и idempotency contracts проходят после каждого slice.
- [ ] Клиентский price/quantity никогда не является финансовой истиной.
- [ ] Суперадмин видит реальные, test и reversed суммы раздельно по всем business types.
- [ ] Новые типы используют шаблоны и capabilities, а не копии backend.
- [ ] Production writes, migrations, DNS и реальные push не выполняются без отдельного одобрения.

## Child Stories

| № | Вертикальная история | Пользовательская ценность | Осознанно отложено |
|---:|---|---|---|
| 1 | Суперадмин создаёт draft grocery и owner входит в нейтральный кабинет | Проверена безопасная основа нового типа | Публичный каталог, заказ |
| 2 | Владелец публикует простой штучный grocery-каталог и клиент видит его по селу | Первый реальный новый storefront | Вес, сотрудники, замены |
| 3 | Клиент оформляет один весовой товар с серверным расчётом | Проверена новая модель количества | Фактический вес при сборке |
| 4 | Владелец назначает picker, который атомарно принимает заказ с fallback | Безопасная работа сотрудников | Замены и чат |
| 5 | Picker собирает штучные позиции и вводит фактический вес | Полный grocery picking path | Замена отсутствующего товара |
| 6 | Клиент принимает или удаляет одну предложенную замену | Проверен auditable substitution | Свободный чат |
| 7 | Push открывает order chat, где клиент и picker обсуждают другую замену | Быстрое согласование без потери аудита | Медиа/звонки |
| 8 | Готовый grocery-заказ передаётся существующему водителю | Общая доставка для разных типов | Автоматический proximity dispatch |
| 9 | Суперадмин сверяет заказ, комиссию, бизнес и водителя по единому ledger | Прозрачные начисления и споры | Сложная BI-аналитика |
| 10 | Flowers/gifts/household создаются тем же onboarding с другими templates | Масштабирование без копирования backend | Уникальные advanced extensions |
| 11 | White-label домен устанавливается как брендированная PWA с единым SSO | Отдельный бренд, один аккаунт WayYaam | Полностью независимый backend |
| 12 | Pharmacy публикуется только после compliance gate | Нельзя случайно запустить запрещённый режим | Рецептурный эксперимент |

## Slice 1: Superadmin creates a safe grocery tenant

**Value:** суперадмин подключает новый магазин без ручного SQL, владелец получает рабочий вход, существующие бизнесы не меняются.

**Path:** superadmin create form -> trusted onboarding boundary -> business type/template validation -> Auth owner + client/catalog + owner membership atomically -> audit record -> unified list -> owner login redirect -> neutral workspace.

**Release constraint:** hidden behind a grocery feature flag; production migration and publication are excluded.

### Acceptance criteria requiring user confirmation

- [x] В форме суперадмина доступны активные `restaurant`, `coffee_shop`, `confectionery`, `grocery`; будущие типы можно хранить disabled до готовности шаблона.
- [x] Все DB-записи grocery создаются одной транзакцией; Auth-owner компенсирующе удаляется при ошибке транзакции.
- [x] Неизвестный, disabled или compliance-blocked тип отклоняется доверенным backend.
- [x] Новый grocery создаётся `draft`; статический RLS-контракт не даёт анонимно читать draft-каталог.
- [x] Владелец использует существующий unified login и membership-маршрутизацию без второго пароля.
- [x] Кабинет показывает магазинные названия «Магазин», «Товары», «Заказы», не «Ресторан/Блюда».
- [x] Суперадмин использует общий список и существующую агрегацию без выдуманных начислений.
- [ ] Фактический cross-tenant denial на PostgreSQL ожидает локальный/preview Supabase: в текущем окружении нет Docker/Postgres; статические RLS-контракты зелёные.
- [x] Старое создание restaurant/coffee_shop/confectionery и текущий ресторанный checkout остаются зелёными.
- [x] Existing dirty checkout пользователя не затрагивается; изменения находятся только в чистой ветке.

**Required implementation skills:** перед production-кодом загрузить `tdd`, `testing`, `mutation-testing`, `refactoring`, `characterisation-tests`, `domain-driven-design`, `typescript-strict`, `supabase` и `catalogg-working-order`.

**RED:**

- failing business-type registry/domain tests;
- failing onboarding atomicity/validation contracts;
- failing browser tests superadmin -> grocery draft -> owner login;
- failing cross-tenant denial tests;
- existing restaurant characterization tests stay green as controls.

**GREEN:** минимальная реализация только для наблюдаемого Slice 1; без weight, picking, substitutions, chat, finance redesign или white-label.

**MUTATE:** запустить focused mutation scope для registry, capability resolver и onboarding decision logic.

**KILL MUTANTS:** усилить boundary/negative tests; неоднозначные product rules вынести на согласование.

**REFACTOR:** оценить extraction neutral terminology/adapters; не делать массовый rename.

**Done when:** критерии подтверждены пользователем, RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR завершён, lint/typecheck/build и обязательные order contracts зелёные, browser-пути показаны пользователю, commit отдельно одобрен.

## Later Slice Rules

Перед каждым следующим slice:

1. показать точные acceptance criteria;
2. получить подтверждение;
3. загрузить обязательные TDD/testing/mutation/refactoring skills;
4. написать failing behavior test;
5. реализовать только slice;
6. проверить client/business/superadmin/driver поверхности в требуемом объёме;
7. показать mutation report и изменения;
8. отдельно запросить разрешение на commit;
9. не переходить к production write/deploy без отдельного разрешения.

## Mandatory Regression Gate

```bash
node --test scripts/tests/sqlOrderIdempotency.test.mjs scripts/tests/sqlSupabaseFunctionSearchPath.test.mjs scripts/tests/clientPlatformOrderContract.test.mjs
npm run lint
npm run typecheck
npm run build
```

При изменении order status или response parsing:

```bash
node --test src/shared/api/restaurantOrdersApi.test.ts
```

## Pre-PR Quality Gate

1. Focused behavior and RLS tests.
2. Mutation report reviewed.
3. Refactoring assessment complete.
4. Lint, typecheck and build pass.
5. Restaurant golden path contracts pass.
6. Browser journey for actors touched by the slice passes.
7. No unrelated user changes included.
8. No production write or data deletion without separate evidence and approval.

---

*Plan changes require explicit approval. Delete this file when all slices are complete.*
