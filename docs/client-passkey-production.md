# Client Passkey production configuration

WayYaam client Passkeys use Supabase Auth WebAuthn and are bound permanently to `wayyaam.ru`.
Do not change the relying-party ID after clients start registering keys: existing Passkeys would stop working.

The production Auth container must receive:

```dotenv
GOTRUE_PASSKEY_ENABLED=true
GOTRUE_WEBAUTHN_RP_DISPLAY_NAME=WayYaam
GOTRUE_WEBAUTHN_RP_ID=wayyaam.ru
GOTRUE_WEBAUTHN_RP_ORIGINS=https://wayyaam.ru,https://www.wayyaam.ru
```

Deployment order:

1. Back up the database and verify the rollback command.
2. Apply `20260810211952_link_client_passkey_auth.sql`.
3. Deploy `bootstrap-client-passkey` with `CATALOGG_SERVICE_ROLE_KEY` and an optional
   `CLIENT_PASSKEY_ALLOWED_ORIGINS` override.
4. Add the Auth variables and recreate only the Auth container.
5. Confirm `POST /auth/v1/passkeys/authentication/options` no longer returns
   `passkey_disabled`.
6. Deploy the static application.
7. On a real iPhone, register Face ID in the installed PWA, sign out in Safari,
   open a restaurant link from WhatsApp, and confirm Face ID restores the same
   client account and checkout profile.

The committed `supabase/config.toml` uses `localhost` as its relying-party ID for local testing.
Local and production Passkeys are intentionally different credentials.
