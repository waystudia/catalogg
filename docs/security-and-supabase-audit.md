# Security And Supabase Audit

Date: 2026-07-26

Scope: WayCatalog frontend, Supabase configuration, local SQL files, migrations, Edge Functions, environment examples, and limited read-only remote metadata checks.

No database data, tables, buckets, policies, users, DNS, SMTP, OAuth providers, or production secrets were changed during this audit.

## Commands Run

- `curl -L https://supabase.com/changelog.md`
- `supabase --version`
- `supabase db --help`
- `rg --files`
- `rg -n "createClient|supabase\\.from|supabase\\.rpc|supabase\\.auth|supabase\\.storage|\\.channel\\(|postgres_changes" src supabase/functions --count-matches`
- `rg -n "SUPABASE_SERVICE_ROLE|service_role|postgres(ql)?://|VAPID_PRIVATE|-----BEGIN|sk-|eyJ" src supabase scripts .github .env.example`
- `supabase db query --linked` for RLS table metadata
- `supabase migration list --linked`
- `git ls-files .env .env.local .env.example infra/supabase/.env infra/supabase/.env.example`

## Confirmed Architecture

- Frontend: Vite + React single-page app, deployed under `/catalogg/`.
- Supabase client: centralized in `src/shared/supabase.ts`.
- Browser env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and legacy `VITE_SUPABASE_ANON_KEY`.
- Edge Functions: `create-client`, `update-client`, `create-driver`, `update-driver`, `send-web-push`.
- Direct Supabase data access exists in `src/shared/api/*`, `src/app/App.tsx`, and app-level pages.
- Realtime is used for client snapshots, orders, deliveries, drivers, and catalog refreshes.
- Web Push uses Supabase Edge Functions and `web_push_subscriptions`.
- External dependencies include GitHub Pages hosting, Supabase Cloud, Yandex Maps links, Esri map tiles, browser geolocation, and Web Push.

## Supabase Findings

| Severity | Finding | Evidence | Required Action |
| --- | --- | --- | --- |
| High | Many schema files exist outside `supabase/migrations`, so the database may not be fully reproducible from migrations alone. | `catalog_supabase_schema.sql`, `supabase/*.sql`, and migration files all contain schema objects. | Create a migration baseline only after a reviewed `db diff`/schema audit. Do not overwrite production. |
| Critical | `.env.local` was tracked by git. | `git ls-files` returned `.env.local`. | Removed it from the index with `git rm --cached .env.local` and added ignore rules. Rotate any real keys that were ever committed or pushed. |
| High | `.gitignore` did not ignore `.env` files before this audit. | Root `.gitignore` omitted `.env*`; `.env.local` existed locally. | Added ignore rules. Run git history secret scan before public release; rotate any exposed secrets if found. |
| High | Edge Functions use `service_role`; CORS currently allows `*`. | Edge functions define `Access-Control-Allow-Origin: '*'`. | Restrict CORS to known app/admin origins and keep role checks mandatory. |
| High | Web Push webhook secret is optional in code. | `send-web-push` allows calls when `WEB_PUSH_WEBHOOK_SECRET` is absent. | Make the secret mandatory in production deployment and monitor failed sends. |
| Medium | Auth local config allows weak password defaults. | `supabase/config.toml`: `minimum_password_length = 6`, empty `password_requirements`, `secure_password_change = false`. | Raise password requirements before production and document exact Auth settings. |
| Medium | Realtime subscriptions are broad in several areas. | `clientPlatformApi.ts`, `deliveryApi.ts`, `restaurantOrdersApi.ts`, `App.tsx`. | Keep channel cleanup tests and ensure RLS prevents cross-tenant events. |
| Medium | Self-hosted deployment depends on external services unless replaced. | GitHub Pages, Supabase Cloud, Esri/Yandex, Web Push endpoints. | Decide which services must move to Russian infrastructure and which can remain external. |
| Medium | Direct Supabase calls are spread across APIs/pages. | `rg` found Supabase access in many modules. | Gradually centralize data access by domain API modules before self-hosted migration. |

## Positive Findings

- `src/shared/supabase.ts` uses environment variables instead of hardcoded Supabase URLs.
- Fast search did not find `SUPABASE_SERVICE_ROLE_KEY` in browser `src`.
- Edge Functions create/update client and driver verify authenticated user and `is_platform_admin`.
- Remote read-only metadata query showed RLS enabled for public tables returned by the query.
- `supabase migration list --linked` showed local and remote migration IDs aligned through `20260726180000`.

## Remote Metadata Limitations

One read-only RLS query succeeded. Additional read-only metadata queries for policies/server version timed out with Supabase CLI temporary-role connection errors mentioning `SUPABASE_DB_PASSWORD`. Because of that, this audit does not claim full remote policy, grant, bucket, or function coverage. No remote database changes were attempted.

## Immediate Safe Changes Made

- Added `.env` ignore rules.
- Expanded root `.env.example` with browser-safe and server-only placeholders.
- Added self-hosted Supabase infrastructure examples under `infra/supabase/`.
- Added audit, migration, compliance, DR, incident, and web security docs.

## Changes Requiring Confirmation

- Any RLS/policy migration.
- Any `supabase db push`, `db pull`, or `db reset`.
- Any secret rotation.
- Any Auth configuration change in production.
- Any Storage bucket or policy change.
- Any DNS, SMTP, OAuth, or self-hosted deployment change.

## Secret Rotation

No real secret value was printed by this audit. Because `.env.local` was tracked by git, rotate any Supabase, VAPID, SMTP, database, or webhook secret that was stored in it if the tracked file was ever committed or pushed.
