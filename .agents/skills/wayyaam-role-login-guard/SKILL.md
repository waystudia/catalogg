---
name: wayyaam-role-login-guard
description: Diagnose, repair, and prevent WayYaam login failures across client, restaurant, grocery, driver, and platform-admin profiles. Use for any report that an account is not linked, every role rejects valid credentials, login redirects to the wrong cabinet, a production release changes authentication behavior, or code touches loginRedirectApi, Supabase auth scopes, role bindings, production build variables, or the static deploy script.
---

# WayYaam Role Login Guard

Treat authentication, role resolution, session handoff, and cabinet routing as
separate stages. Prove which stage failed before changing passwords or role rows.

## Diagnosis order

1. Preserve the user's dirty checkout and inspect `origin/main` in a clean
   worktree.
2. Inspect the active public `index.html` and main JS before querying user data.
   The main bundle must contain `api.wayyaam.ru` and either an
   `sb_publishable_...` key or a legacy JWT-shaped anon key. Check presence only;
   never print the key.
3. If either value is missing, classify the incident as a broken production
   build. `supabase` is `null`, so role-link errors from the UI are not evidence
   of missing database relationships.
4. If the bundle is configured, inspect production read-only:
   `auth.users`, `platform_admins`, `admin_user`, `users` + `drivers`, `clients`,
   `catalog_members`, `catalogs`, and the definitions/results of
   `resolve_current_login_redirect()` and `has_catalog_admin_access(text)`.
   Mask emails in diagnostic output and never read password hashes.
5. Only repair data when Auth IDs and role rows are genuinely inconsistent.
   Never create a parallel role table or authorize from `user_metadata`.
6. If role resolution is correct, inspect scoped browser-session handoff and
   `returnTo` routing rather than modifying the database.
7. Reproduce the route from a plain `#/profile` tab as well as a direct
   `returnTo` URL. Hash-only navigation does not reload the document, so compare
   the active `assets/index-*.js` with the current no-store shell before blaming
   credentials or role rows.
8. If the destination briefly shows `Проверяем доступ...` and then returns to
   the embedded login, treat password authentication and role resolution as
   successful. Reproduce the handoff with `localStorage` throwing: Safari may
   reload the hash destination after Supabase has fallen back to memory, leaving
   the destination scope without a persisted session.
9. Also reproduce a partially available store: `localStorage.getItem()` can
   return an expired role session while `setItem()` throws `QuotaExceededError`.
   A fresh `sessionStorage` fallback must carry a per-key marker so the expired
   durable value cannot shadow the completed login for restaurant, grocery,
   driver, or platform-admin scopes.

## Required invariants

- Keep Supabase storage scopes isolated: `client`, `restaurant-admin`, `driver`,
  and `platform-admin`.
- After password login, hand the serialized session to the destination scope
  with `preserveSupabaseSessionForRedirect` / `handoffSupabaseSessionToScope`.
- Route every Supabase session read, write, handoff, and role sign-out through
  `getSupabaseAuthStorage`. Keep durable `localStorage` as the first choice,
  same-tab `sessionStorage` as the Safari fallback, and memory only as the final
  same-document fallback. Pass the same adapter to `createClient`; do not add a
  direct auth-token write to `localStorage`.
- Resolve access server-side using `auth.uid()` and established owner/member
  rows. Do not trust editable user metadata.
- Preserve legacy restaurant routes and `/login` compatibility while rejecting
  unsafe or cross-role `returnTo` values.
- A missing production Supabase configuration must report a service
  configuration error, not “account is not linked.”
- Opening the production login panel must call `refreshStaleAuthClient()`. If an
  already-open tab runs an older hashed main asset, reload the document with the
  same hash/`returnTo` before accepting credentials. Never persist the password
  across this refresh.
- After the completed session is handed from the source scope to the
  destination scope, atomically select the clean role URL with
  `history.replaceState` and reload exactly once. The current Supabase client
  remains bound to its startup storage key, so a hash-only transition makes
  the destination cabinet read the emptied source scope and bounce back to
  login. The new document must start on `restaurant-admin`, `driver`, or
  `platform-admin` and read the already persisted destination session. Keep
  final links short (`#/mangal/dashboard`, `#/business/finik`, `#/driver`, and
  `#/admin/clients`) and never leave an `auth-refresh` query behind.

## Release hook

`scripts/deploy-wayyaam-static.sh` is the final fail-closed hook. It must validate
the active main asset before creating or switching a release and reject bundles
without the production API URL or browser-safe key. Keep
`scripts/tests/staticReleaseDeploy.test.mjs` covering both acceptance and
rejection. Keep `scripts/tests/productionAuthBundleGuard.test.mjs` protecting
both the release hook and public smoke check. Mirror the checked-in script to `/usr/local/sbin/deploy-wayyaam-static`
before relying on the server guard.

Never deploy with a plain `VITE_BASE_PATH=/ npm run build`. Supply the production
browser-safe values and confirm the resulting bundle, without printing secrets.

## Acceptance gate

Run:

```bash
npm test
npm run test:browser
npm run lint
npm run typecheck
VITE_BASE_PATH=/ VITE_SUPABASE_URL=https://api.wayyaam.ru \
  VITE_SUPABASE_PUBLISHABLE_KEY="$production_publishable_key" npm run build
node --test scripts/tests/pwaUpdateSafety.test.mjs \
  scripts/tests/caddyTlsCompatibility.test.mjs \
  scripts/tests/staticReleaseDeploy.test.mjs \
  scripts/tests/roleSessionSafetyContract.test.mjs
git diff --check
```

Then deploy through the immutable release script and verify:

- current and previous main assets return 200;
- an unknown hashed asset returns 404;
- shell is `no-store` and hashed assets are immutable;
- 10 sequential HTTPS requests return 200;
- a fresh browser renders the login form with no console errors;
- PostgreSQL, Auth, REST, Storage, Realtime, Edge Functions, and Caddy remain
  available;
- role resolver returns the expected destination for at least one established
  platform admin, driver, restaurant, and grocery account without exposing
  credentials.

Use `.agents/skills/wayyaam-production-white-screen-guard/SKILL.md` for every
production switch. Do not claim credential-level acceptance unless a real test
account login was executed with authorized credentials.

## Incident report

Report the exact failed stage, evidence that relationships were or were not
damaged, fix and hook added, release/rollback identifiers, tests, and any
credential or physical-device evidence that remains unverified.
