# WayCatalog

WayCatalog — весь ассортимент в одном месте. Это PWA-платформа на `React + TypeScript + Vite` с корзиной, заказом через WhatsApp, админ-режимом и редактируемой темой. Supabase подключается через переменные окружения, но демо-режим работает без внешней базы.

## Что уже подготовлено

- структура `app / pages / widgets / features / entities / shared / styles`
- главная, каталог, напитки, карточка блюда и оформление заказа
- фиксированная корзина, быстрый плюс, пересчет количества и суммы
- авто-предложение напитков перед оформлением заказа
- админ-вход, админ-панель на карточках и нижняя панель действий
- редактор дизайна: фон, текст, карточки, акценты, радиусы и фоновая картинка
- локальные демо-данные и Supabase-ready слой данных
- PWA-конфигурация и GitHub Pages workflow для публикации `dist`

## Быстрый старт

1. Установите Node.js 20+.
2. Установите зависимости: `npm install`
3. Запустите проект: `npm run dev`

Проект запускается и без `.env`, потому что в репозитории есть локальные демонстрационные данные. Для подключения Supabase добавьте:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Старое имя ключа также поддерживается для совместимости:

```bash
VITE_SUPABASE_ANON_KEY=...
```

## Универсальная платформа каталогов

В репозитории добавлен foundation-слой для перехода от одного ресторанного MVP к платформе независимых каталогов:

- `catalog_supabase_schema.sql` — новая Supabase-схема для `catalogs`, `template_versions`, ролей, заказов, бронирований, snapshot, audit logs, Storage buckets и RPC `create_public_order`.
- `src/templates/registry.ts` — реестр immutable-шаблонов с dynamic import.
- `src/templates/<template-key>/vN` — отдельные папки версий. Старую версию не менять; новая функциональность выпускается новой папкой и новой записью в реестре/Supabase.
- `src/entities/platform.ts` — типы ролей, статусов, заказов и публичного заказа.

Текущий рабочий UI пока остаётся на старом MVP-слое `supabase/schema.sql`. Новую схему применяйте только как отдельный этап миграции: сначала snapshot, затем preview, затем подтверждение перевода каталога на `template_version_id`.

## Проверка перед публикацией

```bash
npm run check
```

## GitHub Pages

GitHub Pages должен публиковать папку `dist`. В репозитории добавлен workflow `.github/workflows/pages.yml`, который собирает проект и выкладывает `dist` автоматически.

Для сборки с Supabase добавьте в GitHub репозитории secrets:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_ANON_KEY
```

Путь в GitHub: `Settings -> Secrets and variables -> Actions -> New repository secret`.

## Важное замечание

MVP использует демо-CRUD элементы в интерфейсе. Следующий этап для реального ресторана: формы создания/редактирования, загрузка сжатых изображений в bucket `images` и SQL/RLS политики Supabase.
