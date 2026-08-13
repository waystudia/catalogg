# Supabase migrations

This directory contains new, ordered migrations created after the self-hosted
production baseline. Older SQL files under `supabase/` remain manual schema and
patch scripts and must not be copied here retroactively.

The project is already linked to a remote Supabase project, and the existing SQL files in `supabase/` appear to be manually applied schema/patch scripts rather than ordered Supabase CLI migrations.

Do not copy those older files here as executable migrations until the remote
migration history has been checked and a baseline strategy has been approved.
Otherwise, a future `supabase db push` could try to re-apply schema that already
exists in the remote database.

## Applied changes

### 20260813231200_business_type_login_redirect.sql

- Applied to the Russian self-hosted production database on 2026-08-13.
- Keeps one profile login for all roles, but sends grocery owners to `/business/:slug` and restaurant owners to their existing `/:slug/dashboard` workspace.
- Uses the real catalog membership/ownership and business type; no account or catalog type is rewritten.
- Restricts the security-definer resolver to authenticated users and uses an empty search path.
- Pre-migration function backup: `/var/backups/wayyaam/resolve-login-before-20260813-2312.sql` on the production host.
- Production role simulation returned `/business/finik` for the real Finik owner and `/mangal/dashboard` for the real Mangal owner; both catalog access checks returned true and both checks were rolled back.

### 20260813193106_grocery_inventory_receiving.sql

- Applied to the Russian self-hosted production database on 2026-08-13.
- Adds catalog-scoped private inventory costs/minimum stock, immutable inventory documents and movement lines.
- Adds the authenticated owner/admin/editor-only `post_catalog_receiving` RPC, which locks product rows and posts document, lines, stock, prices and audit evidence atomically.
- Anonymous access is revoked; member reads and editor writes use separate RLS policies.
- Pre-migration backup: `/var/backups/wayyaam/grocery-inventory-pre-20260813-2252.dump` on the production host.
- Production verification used a real Finik member inside a transaction: stock changed from 20 to 21 with one document, then rollback restored stock 20 and left no QA document or audit row.

### 20260813182421_self_service_partner_registration.sql

- Applied to the Russian self-hosted production database on 2026-08-13.
- Adds self-service onboarding and review metadata to `clients` and `drivers`.
- Adds private `partner_documents` metadata, the private
  `partner-documents` Storage bucket, owner/admin RLS policies, and 10 MB
  JPG/PNG/PDF limits.
- Adds the service-role-only `create_self_service_partner` RPC plus
  authenticated seller legal-profile and submission RPCs.
- Adds approval synchronization triggers for the existing client `status` and
  driver `is_active` admin controls.
