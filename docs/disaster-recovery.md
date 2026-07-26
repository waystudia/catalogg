# Disaster Recovery

## Objectives

- Draft RPO: 15 minutes for database after production launch.
- Draft RTO: 4 hours for customer ordering, 8 hours for admin analytics.
- Final values must be approved by the business owner.

## Assets To Back Up

- PostgreSQL database.
- Supabase Auth users and settings.
- Storage buckets and object metadata.
- Edge Function source and secrets inventory.
- Environment variables.
- DNS/TLS configuration.
- Web Push VAPID keys.

## Restore Runbook

1. Freeze writes or switch app to maintenance mode.
2. Restore Postgres backup to an isolated instance.
3. Validate schema version and migrations.
4. Restore Storage objects and bucket policies.
5. Recreate Auth settings, SMTP, redirects, and secrets.
6. Deploy Edge Functions with production secrets.
7. Run smoke tests for client checkout, restaurant orders, driver order lifecycle, scanner, and push notifications.
8. Switch traffic only after validation.

## Tests Needed

- Monthly restore drill in staging.
- Quarterly production backup integrity check.
- Automated alert if backups fail or are older than RPO.
