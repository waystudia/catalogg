---
name: wayyaam-production-white-screen-guard
description: Preserve and verify the WayYaam Russian production safeguards that prevent mobile Safari, installed PWA, Android, and ordinary browser white screens. Use for every WayYaam production deployment; changes to Vite, index.html, service workers, PWA lifecycle, caching, hashed assets, Caddy, TLS, HTTP protocols, MSS, domains, release scripts, GitHub Pages parity, or Supabase endpoints; and any report that wayyaam.ru opens intermittently, fails after reopening an installed app, or works in one browser/network but not another.
---

# WayYaam Production White-Screen Guard

Treat `https://wayyaam.ru/` and the Russian self-hosted stack as the production contract. Never declare a deployment complete until every applicable guard below passes through the public route.

Keep this skill project-local at `.agents/skills/wayyaam-production-white-screen-guard/`.

## App Parity Contract

- Production site: `https://wayyaam.ru/` and `https://www.wayyaam.ru/`.
- Production API: `https://api.wayyaam.ru/`; do not assume site-domain `/rest/v1/*` accepts API methods.
- Static web root: `/var/www/wayyaam.ru` with `current`, immutable `releases/`, and append-only `shared-static/assets`.
- Static deploy entrypoint: `/usr/local/sbin/deploy-wayyaam-static`, mirrored by `scripts/deploy-wayyaam-static.sh`.
- Local and CI use lighter networking and cannot prove mobile TLS or installed-PWA behavior. Compensate with repository contract tests plus public smoke checks.
- GitHub Pages uses `/catalogg/`; Russian production must be built with `VITE_BASE_PATH=/`. This difference is intentional and must stay explicit.
- User-confirmed production rule, 2026-08-04: do not delete previous releases, backups, shared assets, application data, or temporary SSH authorization unless separately authorized.

## Production Truth Sources

Read these before changing or deploying an affected surface:

- `index.html`: one-time legacy worker/cache retirement and visible loading shell.
- `src/main.tsx` and `src/shared/pushServiceWorker.ts`: application bootstrap; they may register only the persistent network-only worker at `sw.js?mode=push` and must never reload the page on worker lifecycle events.
- `src/sw.ts`: network-only Web Push worker; it deletes legacy caches, owns no fetch routes, and remains registered for background notifications.
- `vite.config.ts`: root/base behavior and empty service-worker precache (`globPatterns: []`).
- `infra/caddy/Caddyfile`: production TLS, h1/h2-only edge, cache headers, real asset 404s, and media proxy.
- `infra/systemd/configure-wayyaam-tls-mss.sh` and `infra/systemd/wayyaam-tls-mss.service`: boot-persistent TCP MSS 1200 workaround.
- `scripts/deploy-wayyaam-static.sh`: immutable releases and shared historical assets.
- `.agents/skills/wayyaam-role-login-guard/SKILL.md`: production auth configuration, role resolution, and scoped-session invariants.
- `scripts/tests/pwaUpdateSafety.test.mjs`: executable PWA retirement contract, including clean first launch and failure retry.
- `scripts/tests/caddyTlsCompatibility.test.mjs`: executable TLS/Caddy/MSS contract.
- `scripts/tests/staticReleaseDeploy.test.mjs`: executable immutable-release and old-asset contract.
- `.github/workflows/pages.yml`: CI runtime, tests, build, and GitHub Pages behavior.
- `docs/disaster-recovery.md`: backup and recovery requirements.
- `.agents/skills/catalogg-working-order/SKILL.md`: order-flow invariants that must survive infrastructure fixes.

If the worktree is behind `origin/main`, inspect the truth sources from both the worktree and `origin/main` with `git show origin/main:<path>`. Preserve all dirty user changes; never reset or replace them to obtain a newer file.

## Failure Model And Invariants

### PWA lifecycle

- Never add `controllerchange` reloads, cache-first pages/images, or unconditional startup reloads. The one allowed automatic registration is the network-only Web Push worker at `sw.js?mode=push`.
- A clean first launch must not navigate twice.
- Remove legacy caching registrations/caches before the one required cleanup reload only when legacy state actually exists. Preserve registrations whose worker URL has `mode=push`.
- Do not mark cleanup complete after failed unregister/cache deletion; retry on the next launch without a reload loop.
- Strict/private storage failure must not prevent startup or cause a reload loop.
- Keep `sw.js`, `index.html`, `/`, and `manifest.webmanifest` network-fresh.
- `src/sw.ts` handles background push and must remain registered. It must never register a `fetch` handler, precache application files, claim open clients, or unregister itself.

### Static releases and cache headers

- Build Russian production with `VITE_BASE_PATH=/` and production API variables.
- Create a unique `release-*`; never overwrite an existing release.
- Copy new hashed assets into `shared-static/assets` without deleting old hashes.
- Point the new release's `assets` symlink to `../../shared-static/assets`.
- Serve `/assets/*` directly. A missing hashed JS must return 404 with no HTML fallback.
- Serve hashed assets with `public, max-age=31536000, immutable`.
- Serve the app shell with `Cache-Control: no-store`.
- Capture the previous main JS path before switching and prove it remains 200 afterwards.
- Refuse a release whose main bundle does not contain `api.wayyaam.ru` and a browser-safe Supabase key; never print the key while checking it.

### Mobile network and TLS

- Keep external edge protocols at h1/h2; do not advertise HTTP/3 and clear `Alt-Svc`.
- Keep the production workaround represented in `infra/caddy/Caddyfile`: TLS 1.2 only with `x25519`, until a separately verified provider/network change replaces it.
- Keep the idempotent MSS clamp for outbound HTTPS SYN packets at 1200 and its enabled systemd unit.
- A normal static release must not reload Caddy.
- After any Caddy action, run at least 10 sequential public HTTPS requests. If external TLS stalls, restart only `supabase-caddy`, then repeat all checks. Do not restart PostgreSQL or the Supabase stack.

## Inspection And Deployment Workflow

1. Inspect `git status`, `git diff`, current branch, `origin/main`, and the truth sources. Preserve unrelated and uncommitted work.
2. For PWA/cache/TLS/release changes, add or update a failing contract test before implementation.
3. Run the mandatory local gate:

   ```bash
   npm test
   npm run test:browser
   npm run lint
   npm run typecheck
   VITE_BASE_PATH=/ npm run build
   git diff --check
   ```

4. Also run the focused guard:

   ```bash
   node --test \
     scripts/tests/pwaUpdateSafety.test.mjs \
     scripts/tests/caddyTlsCompatibility.test.mjs \
     scripts/tests/staticReleaseDeploy.test.mjs
   ```

5. Verify `dist/index.html` references root `/assets/...`, the referenced files exist, and `dist/sw.js` contains no page/image cache routes or self-unregistration while the main bundle registers `sw.js?mode=push`.
6. Before server mutation, verify the approved SSH identity, exact target, `current`, container health, Caddy restart policy, and available backup. Never print private keys or secrets.
7. Upload `dist` to a unique incoming directory and switch with `/usr/local/sbin/deploy-wayyaam-static`. Do not remove the upload, old releases, backups, or shared assets.
8. Do not reload Caddy for a static deployment. If Caddy config changed, validate the config first and apply only the approved targeted action.
9. Run the bundled public smoke test, passing the previous main asset when known:

   ```bash
   .agents/skills/wayyaam-production-white-screen-guard/scripts/check-public-production.sh \
     https://wayyaam.ru \
     /assets/<previous-main>.js
   ```

10. Open a genuinely fresh browser tab on a cache-busted URL. Verify `#root` has rendered children, the current main JS loaded, images are not broken, and the console has no errors. Do not place a real order without authorization.
11. When PWA bootstrap changed, verify both Safari navigation and an installed home-screen launch. Repository simulation is mandatory; a real iPhone check remains the final device-specific evidence.
12. Confirm PostgreSQL, Auth, REST, Storage, Realtime, and `supabase-caddy` remain available. Use the configured API domain and publishable key where the endpoint requires it.

## Blocking Conditions

Stop deployment or roll back `current` to the known-good release with explicit authorization if any condition occurs:

- clean startup triggers a second navigation;
- cleanup failure is marked complete;
- the current push-only worker is removed, unregisters itself, or is never registered;
- current `index.html` references a missing module;
- current main JS has no production Supabase URL or browser-safe key;
- the previous main asset is no longer 200;
- an unknown `/assets/*.js` returns HTML or any status other than 404;
- app-shell responses are cacheable or hashed assets are not immutable;
- any of 10 sequential HTTPS requests times out or is not 200;
- fresh-browser rendering is empty or console errors prevent bootstrap;
- Caddy, PostgreSQL, Auth, REST, or Storage health regresses.

Never delete a failing release or old assets during rollback; preserve evidence for diagnosis.

## Fix Patterns

- Stale PWA state: improve the retirement state machine and its simulation tests; preserve the push-only worker and do not add broad runtime caching.
- Mixed old HTML/new assets: preserve shared hashed assets and deploy an immutable release; do not weaken module MIME checks or return `index.html` for missing JS.
- Mobile-only TLS stalls: compare live Caddy/systemd state to the checked-in contract, validate h1/h2, TLS 1.2, x25519, Alt-Svc clearing, and MSS 1200 before changing application code.
- One browser works while another fails: compare active script hash, console errors, installed-worker state, response headers, and TLS reachability. Do not assume cache or device version without evidence.
- Supabase outage with rendered shell: diagnose the configured `api.wayyaam.ru` services separately; an API failure must not be mislabeled as a static white-screen failure.

## Question Protocol

Ask one concise question only when repository and read-only production inspection cannot answer a decision that changes behavior, such as replacing the TLS workaround, restoring service-worker registration, deleting old releases, or changing the production host. Record the answer in this skill or a checked-in runbook.

## Output Contract

Every invocation must report:

- truth-source files and production surfaces inspected;
- dirty work preserved and branch/origin state;
- drift found and fixes made;
- full and focused tests run;
- production release name and previous release retained;
- current and previous main asset results, unknown-asset 404, cache headers, and 10-request HTTPS sequence;
- fresh-browser/PWA evidence and console result;
- Caddy, PostgreSQL, Auth, REST, Storage, and SSH-key state;
- explicit divergences or unanswered decisions.
