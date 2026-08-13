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
