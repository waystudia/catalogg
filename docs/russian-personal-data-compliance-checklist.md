# Russian Personal Data Compliance Checklist

This is not legal advice. Review with a Russian personal-data compliance specialist before launch.

| Requirement | Status | Notes |
| --- | --- | --- |
| Identify personal data operator | Open | Name legal entity and responsible officer. |
| Define personal data processing purposes | Drafted | Ordering, delivery, support, billing, notifications. |
| Publish privacy policy in Russian | Open | Include geolocation, push notifications, storage, retention. |
| Obtain user consent where required | Open | Checkout, geolocation prompt, push notifications, account/profile. |
| Data localization | Open | Decide Russian hosting for database, storage, logs, backups. |
| Cross-border transfer assessment | Open | Supabase Cloud, GitHub Pages, Esri/Yandex, Web Push vendors. |
| Access control and role model | Partial | RLS present; full policy review still required. |
| Incident response process | Drafted | See `docs/security-incident-response.md`. |
| Backups and restore drills | Drafted | See `docs/disaster-recovery.md`. |
| Retention and deletion policy | Open | Define exact retention by data category. |
| Processor/vendor registry | Open | Supabase, hosting, maps, SMS/email/push vendors. |
| Employee/admin access logging | Partial | `audit_logs` exists; coverage must be verified. |
| DPIA/threat model | Open | Required before production if high-risk processing is confirmed. |

## Before Russia Production

- Move or justify database/storage/log processing location.
- Confirm all vendors and cross-border transfer basis.
- Implement retention jobs and delete/export workflows.
- Validate RLS, Storage policies, and admin logs with tests.
