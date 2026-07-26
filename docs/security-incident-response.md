# Security Incident Response

## Severity Levels

- SEV1: service-role key leak, database exposure, cross-tenant data access, mass personal-data disclosure.
- SEV2: account takeover, admin function abuse, storage object exposure, repeated failed auth/push incidents.
- SEV3: isolated user issue, non-sensitive error, failed notification without data exposure.

## First Hour

1. Preserve logs and timestamps.
2. Identify affected users, tables, buckets, functions, and keys.
3. Contain the incident without deleting evidence.
4. Rotate secrets only after confirming exposure and impact.
5. Disable compromised accounts or functions if necessary.
6. Notify owner and legal/compliance reviewer.

## Evidence To Capture

- Supabase Auth logs.
- Edge Function logs.
- Database audit logs.
- Git commit and deployment IDs.
- Browser/user reports and screenshots.
- Affected rows, buckets, and object paths.

## Post-Incident

- Root-cause analysis.
- Patch and regression tests.
- User/regulator notification decision.
- Update runbooks and monitoring.
