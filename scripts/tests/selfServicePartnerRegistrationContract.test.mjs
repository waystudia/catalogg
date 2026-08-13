import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../../supabase/migrations/20260813182421_self_service_partner_registration.sql', import.meta.url), 'utf8');
const edgeFunction = await readFile(new URL('../../supabase/functions/register-partner/index.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../../src/features/partner-registration/PartnerRegistrationPage.tsx', import.meta.url), 'utf8');

test('seller onboarding stays draft and receives only a 48-hour setup trial', () => {
  assert.match(migration, /status = 'draft'::public\.catalog_status/);
  assert.match(migration, /now\(\) \+ interval '48 hours'/);
  assert.match(migration, /'pending', 'draft', true, 'demo', 'trial'/);
});

test('driver application is persisted inactive and cannot receive orders before approval', () => {
  assert.match(migration, /false, false, 'offline'/);
  assert.match(migration, /'self_service', 'pending'/);
});

test('phone is explicitly unverified and registration does not claim WhatsApp or OTP verification', () => {
  assert.match(migration, /phone_verified boolean not null default false/);
  assert.doesNotMatch(edgeFunction, /phone_confirm\s*:\s*true|whatsapp|otp/i);
  assert.doesNotMatch(page, /whatsapp|одноразов|код подтверждения/i);
});

test('Auth administration remains server-only and compensates a failed database transaction', () => {
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /admin\.auth\.admin\.createUser/);
  assert.match(edgeFunction, /admin\.auth\.admin\.deleteUser\(createdUserId\)/);
  assert.doesNotMatch(page, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test('partner documents are private and limited to supported types and ten megabytes', () => {
  assert.match(migration, /'partner-documents', 'partner-documents', false, 10485760/);
  assert.match(migration, /mime_type in \('image\/jpeg', 'image\/png', 'application\/pdf'\)/);
  assert.match(migration, /storage\.foldername\(name\).*auth\.uid/s);
});
