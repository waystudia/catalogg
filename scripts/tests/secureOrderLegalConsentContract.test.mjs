import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260818080335_secure_order_access_and_legal_evidence.sql', 'utf8');
const clientApi = readFileSync('src/shared/api/clientPlatformApi.ts', 'utf8');
const checkout = readFileSync('src/features/checkout/CheckoutScreen.tsx', 'utf8');
const platformCheckout = readFileSync('src/pages/client-platform/ClientPlatformApp.tsx', 'utf8');

test('legacy UUID-only order RPCs are revoked and the participant RPC derives access server-side', () => {
  assert.match(migration, /revoke all on function public\.get_public_restaurant_order_status\(uuid\)/i);
  assert.match(migration, /revoke all on function public\.get_public_order_tracking\(uuid\)/i);
  assert.match(migration, /create or replace function public\.get_order_participant_status\(\s*target_order_id uuid,\s*client_session_token text default null,\s*guest_tracking_token text default null\s*\)/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /public\.is_catalog_member/i);
  assert.match(migration, /delivery\.driver_id = viewer_driver_id/i);
  assert.match(migration, /public\.is_platform_admin\(\)/i);
});

test('guest tracking keeps only a hash and enforces expiry and revocation', () => {
  assert.match(migration, /order_guest_tracking_tokens[\s\S]*token_hash bytea[\s\S]*expires_at[\s\S]*revoked_at/i);
  assert.match(migration, /extensions\.gen_random_bytes\(32\)/i);
  assert.match(migration, /extensions\.digest\([\s\S]*guest_token[\s\S]*'sha256'/i);
  assert.match(migration, /token\.expires_at > pg_catalog\.now\(\)[\s\S]*token\.revoked_at is null/i);
  assert.doesNotMatch(migration, /guest_tracking_token\s+text\s+(?:not\s+)?null/i);
});

test('document releases are server-pinned and evidence is append-only and order-linked', () => {
  assert.match(migration, /legal_document_version_invalid/);
  assert.match(migration, /3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972/);
  assert.match(migration, /prevent_legal_acceptance_mutation/);
  assert.match(migration, /before update or delete on public\.legal_consent_records/i);
  assert.match(migration, /document_code[\s\S]*order_transfer_consent[\s\S]*created_order_id/i);
});

test('sensitive client tracking uses protected polling rather than direct table subscriptions', () => {
  assert.match(clientApi, /get_order_participant_status/);
  assert.match(clientApi, /window\.setInterval/);
  assert.doesNotMatch(clientApi, /postgres_changes[^\n]+table:\s*'(?:orders|deliveries|drivers)'/i);
});

test('all required confirmations are separate and unchecked by default', () => {
  for (const source of [checkout, platformCheckout]) {
    assert.match(source, /useState\(false\)/);
    assert.match(source, /checked=\{acceptedAgreement\}/);
    assert.match(source, /checked=\{acceptedPersonalData\}/);
    assert.match(source, /checked=\{acceptedAdvertising\}/);
    assert.match(source, /checked=\{acceptedOrderTransfer\}/);
  }
});

test('the production legal directory contains only the public allowlist', () => {
  assert.deepEqual(readdirSync('public/legal').sort(), [
    '01-personal-data-policy.html',
    '02-user-agreement.html',
    '03-cookie-policy.html',
    '04-client-consent.html',
    '05-restaurant-consent.html',
    '06-driver-consent.html',
    '07-advertising-consent.html',
    '08-order-data-transfer-consent.html',
    '09-restaurant-offer.html',
    '10-driver-offer.html',
    'index.html'
  ]);
  const publicLegal = readdirSync('public/legal')
    .map((name) => readFileSync(`public/legal/${name}`, 'utf8'))
    .join('\n');
  assert.doesNotMatch(publicLegal, /\[ЗАПОЛНИТЬ\]|Рабочий проект|eu-west-2|studiacatalog@outlook\.com/i);
  assert.doesNotMatch(publicLegal, /\{(?:EMAIL|OPERATOR|PROCESSING_START_DATE|DOMAIN)\}/);
});
