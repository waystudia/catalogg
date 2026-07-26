# Cloud To Self-Hosted Migration Plan

## Phase 0: Readiness

- Complete this audit.
- Verify no secrets in frontend or git history.
- Build complete migrations from the current production schema.
- Document Auth, Storage, Realtime, Edge Function, SMTP, and Web Push settings.

## Phase 1: Staging Self-Hosted

1. Deploy self-hosted Supabase in an isolated staging environment.
2. Restore a sanitized database snapshot.
3. Restore sanitized Storage data.
4. Deploy Edge Functions with staging secrets.
5. Point a staging app build to the staging Supabase URL.
6. Run smoke tests.

## Phase 2: Production Dry Run

- Take a fresh production backup.
- Restore to a production-like self-hosted environment.
- Validate migrations, RLS, Storage policies, Auth, Realtime, and Edge Functions.
- Measure performance and backup restore time.

## Phase 3: Cutover

1. Announce maintenance window.
2. Freeze writes.
3. Take final backup.
4. Restore database and storage.
5. Deploy functions and secrets.
6. Update environment variables and hosting config.
7. Run smoke tests.
8. Enable traffic.
9. Monitor errors, auth, orders, delivery lifecycle, and push notifications.

## Rollback

- Keep Supabase Cloud unchanged until self-hosted cutover is verified.
- If cutover fails, restore frontend env to Cloud values and unfreeze Cloud writes.
