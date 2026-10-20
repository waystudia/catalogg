# Финальный prompt set для макетов саморегистрации

Режим генерации: встроенный `image_gen`, use case `ui-mockup`.

## Общий prompt

```text
Asset type: single portrait iPhone app screen or responsive mobile admin screen, shippable UI mockup.
Style/medium: realistic production UI, native iOS/system typography, not concept art.
Primary request: extend the existing WayYaam interface shown in the supplied screenshots; do not redesign the application and do not create a new dashboard or navigation.
Color palette: existing pale gray-lilac background, white rounded cards and fields, charcoal text, muted gray secondary text, #4949ee mobile accent; existing #5b3df5 admin accent.
Constraints: preserve existing spacing, rounded controls, back navigation, sticky primary buttons and current bottom navigation where it already exists. Russian text only. No extra features, no unrelated illustration, no watermark.
```

## Экранные добавки к общему prompt

1. Текущий профиль

```text
Preserve the current Profile structure: guest profile card, "Личный кабинет", expanded "Войти / Регистрация" segment, existing menu and bottom tabs. Do not show role cards yet.
```

2. Выбор роли

```text
Header "Регистрация". Subtitle "Выберите, как вы будете работать". Two cards only: "Я продавец" / "Ресторан, кафе или магазин" and "Я курьер" / "Буду доставлять заказы".
```

3. Данные владельца

```text
Header "Данные владельца". "Шаг 1 из 2 · Аккаунт продавца". Fields: "Имя и фамилия", "+7 900 000-00-00", "Электронная почта", "Пароль", "Повторите пароль". Button "Продолжить".
```

4. WhatsApp

```text
Header "Подтверждение номера". Instruction to open WhatsApp and receive a code. Phone row with "Открыть WhatsApp", exactly six code boxes, "Другой способ", button "Подтвердить".
```

5. Данные бизнеса

```text
Header "О бизнесе". "Шаг 2 из 2 · Данные продавца". Controls: business type, business name, work phone, city, order geography, seller terms. Button "Создать кабинет". Do not request INN or documents here.
```

6. Демо продавца

```text
Header "Кабинет создан". Status "Демо-режим · 2 дня". Checklist for catalog, legal details and documents. Explicit note that catalog publication and real orders are unavailable before approval. Actions "Перейти в кабинет" and "Заполнить документы".
```

7. Подтверждение бизнеса

```text
Header "Подтверждение бизнеса". Demo time remaining. Legal status, INN, legal/person name, work phone, two private document upload rows, data-accuracy confirmation, button "Отправить на проверку".
```

8. Данные курьера

```text
Header "Данные курьера". "Шаг 1 из 3 · Аккаунт". Reuse the seller account form component with courier title. No car or passport fields yet.
```

9. География курьера

```text
Header "География". "Шаг 2 из 3 · Где вы живёте и работаете". Residence, work city and work areas. Note that orders will be shown only in the selected zone. No map and no GPS prompt.
```

10. Транспорт

```text
Closely preserve the supplied existing "Транспорт" screen. "Шаг 3 из 3 · Данные автомобиля". Vehicle type, make, model, Russian plate, color, optional "Сканировать СТС", button "Отправить заявку".
```

11. Заявка курьера

```text
Header "Заявка отправлена". Status "На проверке". Summary of phone, work city, vehicle and plate. Note about notification. Actions "Изменить анкету" and "Выйти". No access to orders.
```

12. Суперадмин — продавец

```text
Responsive view of the existing "Договоры и активации" page. Self-registration badge, owner/contact/business/city/masked-INN/document/demo data, review status, actions "Открыть заявку" and "Одобрить". Do not create a separate admin app.
```

13. Суперадмин — курьер

```text
Responsive view of the existing "Водители" page. Applications filter, self-registration and review badges, phone, residence, work areas and vehicle, actions "Открыть анкету" and "Активировать". No separate module and no automatic activation.
```
