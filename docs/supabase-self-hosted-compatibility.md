# Supabase Self-Hosted Compatibility

Goal: keep WayCatalog working on Supabase Cloud now, while making a later self-hosted Supabase move mostly an infrastructure and environment-variable change.

## Compatibility Matrix

| Area | Current State | Self-Hosted Risk | Preparation |
| --- | --- | --- | --- |
| Frontend config | Uses Vite env variables. | Low if no hardcoded URLs remain. | Keep all Supabase and app URLs in env. |
| Database schema | Split across migrations and standalone SQL files. | High reproducibility risk. | Produce reviewed migration baseline; do not run destructive commands. |
| Auth | Supabase Auth with email/password. | Medium; settings must be replicated. | Document password, redirect, SMTP, JWT, and session settings. |
| Storage | Supabase Storage enabled. | Medium; bucket policies and object data must migrate. | Inventory buckets and test upload/read policies. |
| Realtime | Used for orders, delivery, drivers, catalog refresh. | Medium; publication/RLS must match. | Test subscriptions after migration and avoid unnecessary broad channels. |
| Edge Functions | Used for admin provisioning and Web Push. | Medium; secrets and runtime versions must match. | Keep all secrets in env, pin/verify Deno/runtime behavior. |
| Web Push | Uses VAPID keys and endpoint subscriptions. | Medium; endpoints remain browser/vendor dependent. | Store VAPID keys securely; prune expired subscriptions. |
| Maps/geolocation | Browser geolocation, Yandex links, Esri tiles. | Medium/high for Russian data localization policy. | Decide approved map provider and reverse geocoder. |
| Hosting | GitHub Pages. | High if production must be hosted in Russia. | Plan Russian hosting/CDN and TLS. |

## Supabase Changelog Items To Track

- Self-hosted Supabase default API gateway changes from Kong to Envoy in August 2026.
- Self-hosted Auth `API_EXTERNAL_URL` includes `/auth/v1` in current releases.
- Extension version pinning is being deprecated/ignored.
- Management API `logs.all` endpoint removal is scheduled for September 2026.
- Newly created public schema objects are no longer auto-exposed to Data API by default.

## Portability Rules

- No `service_role` in frontend.
- No hardcoded hosted Supabase project URL in app code.
- Every exposed table must have RLS and explicit policies.
- Every Edge Function must verify caller identity and role before using service role.
- Storage access must be policy-driven, not public-by-accident.
- Operational scripts must accept env variables, not embedded credentials.
