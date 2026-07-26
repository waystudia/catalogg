# Supabase Self-Hosted Infra Skeleton

This folder is a safe preparation layer. It does not replace the current Supabase Cloud project and must not be used to deploy production as-is.

## Current Rule

- Keep the application working on Supabase Cloud.
- Do not run `supabase db push`, `supabase db pull`, `supabase db reset`, or destructive migrations without explicit approval.
- Do not commit real `.env` files or service-role keys.

## How To Use Later

1. Choose and pin a Supabase self-hosted release.
2. Copy the official Supabase self-hosted Docker Compose files for that exact release.
3. Copy `.env.example` to `.env` outside git and replace every placeholder.
4. Apply `docker-compose.override.example.yml` carefully after matching service names to the selected release.
5. Restore database, storage, auth settings, edge function secrets, and web-push secrets from audited backups.
6. Point the app to the new instance by changing environment variables only.

## Compatibility Notes

- Supabase announced that self-hosted deployments move from Kong to Envoy as the default API gateway during August 2026. Do not hardcode gateway-specific assumptions.
- Self-hosted Auth `API_EXTERNAL_URL` should include `/auth/v1` for current Supabase versions.
- Extension version pinning is being deprecated; future migrations should avoid hard-pinning extension versions.

## Production Requirements

- TLS termination and HSTS.
- Private Postgres networking.
- Backups with restore drills.
- SMTP, SMS, and Web Push secrets stored outside git.
- Studio protected by VPN, SSO, or an internal network.
- Monitoring for database, storage, edge functions, auth errors, and queue/webhook failures.
