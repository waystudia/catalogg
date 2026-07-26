# Web Security Checklist

| Area | Status | Required Action |
| --- | --- | --- |
| Secrets in frontend | Partial | Keep service role and VAPID private key server-only; run history scan. |
| XSS | Open | Review all rendered user content, image URLs, banner text, comments, and QR payloads. |
| SQL injection | Mostly low | Supabase query builder is used; review RPC functions for dynamic SQL. |
| CSRF | Medium | Supabase bearer tokens reduce risk; Edge Functions still need origin/role checks. |
| CORS | Needs hardening | Replace `*` in Edge Functions with an allowlist for production. |
| IDOR / tenant isolation | Needs tests | Test client, restaurant, driver, and super-admin boundaries through RLS and functions. |
| Auth sessions | Needs hardening | Increase password rules and document refresh/session behavior. |
| Storage uploads | Needs review | Validate MIME, size, extension, object path ownership, and public access. |
| Open redirects | Needs review | Validate redirect/login target logic. |
| Realtime | Needs review | Ensure channels clean up and RLS filters sensitive rows. |
| Security headers | Open | Add production headers: HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. |
| Dependencies | Open | Run dependency audit and keep Supabase JS/CLI versions tracked. |
| Logging | Partial | Avoid logging personal data and secrets; ensure audit logs cover admin actions. |
