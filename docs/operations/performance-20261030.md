# WayYaam performance maintenance, 2026-10-30

The production frontend is React/TypeScript/Vite. The API uses self-hosted Supabase (PostgREST/PostgreSQL, Auth, Storage, Realtime and Edge Runtime). Twelve running containers share one VPS; containers are not separate servers.

Changes:

- Catalog save operations upload draft images to `catalog-assets/<catalog-id>/media/<sha256>.<extension>` before saving database references. Existing HTTP and local URLs are preserved. Upload failures stop the save. Content hashes allow safe deduplication and long caching without stale replacements.
- Initial marketplace data no longer waits for product photos. Primary photos load afterward, in batches of 100 IDs to respect proxy URL limits.
- Public catalog visibility is computed once per SQL statement, using the existing visibility function. A private-schema helper is not exposed as a PostgREST RPC. Membership/write policies are unchanged. The migration is repeatable; it adds a catalog/sort index for product options.
- `scripts/migrate-catalog-media.py` defaults to dry run. Apply mode backs up original records privately, uploads content-addressed objects, downloads and verifies SHA-256, then updates only unchanged records. No data or media objects are deleted. Do not publish its backups.

Production observations:

- Before: a coffee product-options query under `anon` took 492.989 ms, checking 1030 rows. After: 26.117 ms. This measures SQL execution, not end-user screen rendering.
- Published-catalog membership matched the original visibility predicate for anonymous access and every existing account.
- Migrated 25 records, with 18 unique verified media files. Backup: `/opt/supabase-backups/media/20261030T145716Z.json`.
- Removed three temporary staging directories only after byte-for-byte verification against retained releases. Cleaned old system journal archives and package cache. Application data, media, immutable releases and existing backups were preserved.

Storage and database still share one server. Moving images out of database responses reduces response size, but does not move media to a separate physical disk or provide a CDN. More VPS resources or separate services should follow measurements. A background queue is suitable for image processing and notifications; ordinary catalog reads should remain direct. No queue infrastructure was introduced by this maintenance.

Gateway follow-up: the 100-user run exposed `1024 worker_connections are not enough` in Kong logs, with 655 HTTP 502 responses. Configured 8192 connections/file descriptors per worker and container nofile limits of 16384, using the [documented Kong settings](https://developer.konghq.com/gateway/configuration/). Kong alone was recreated; PostgreSQL and Caddy were not restarted. Kong access logs are now rotated at 10 MiB with three retained files. The compose backup is stored privately with the existing server backups. Free root-disk space increased from 2.6 to 5.4 GiB (94% to 86% used).

The production checkout release `5b86984e` appeared while this work was in progress. Its four-file checkout change was merged before publishing this maintenance. Manual CI branch runs now skip the protected GitHub Pages deploy job; build/test still run. Actual Pages publishing remains restricted to `main`.

The load generator now uses a bounded HTTP/1.1 keep-alive agent (256 sockets, configurable with `--connections`). Earlier native Node 26 fetch/HTTP2 runs developed connection timeouts under burst load, including requests that never reached the API. Reports explicitly identify transport and connection cap. Virtual users are concurrent journeys, each with multiple API reads; they are not a count of simultaneous browser sessions. Driver profile and restaurant orders were verified with ordinary authenticated RLS; no orders were created or advanced.

Remaining network limitation: fresh Chromium 149 sessions sometimes stall during TLS negotiation to the API and keep catalog placeholders visible. Disabling HTTP/2 in the test browser fetched the actual Finik catalog successfully. This does not prove an HTTP/2 server defect: curl/Node can succeed, and traces show unfinished TLS handshakes. An API-only HTTP/1.1 canary and MSS 1024 canary did not solve the default-browser case; both were reverted. Production retains h1/h2, TLS 1.2/x25519 and MSS 1200. A placeholder screenshot is not proof of a successfully loaded catalog. Physical iPhone/PWA behavior and universal resolution of connection stalls remain unverified.

The later production UI release `011d7f1f` includes this maintenance through ancestor `310500ea`; its order-card and checkout changes were merged into this branch as well. The live release must be checked separately from the diagnostics-tool commit.
