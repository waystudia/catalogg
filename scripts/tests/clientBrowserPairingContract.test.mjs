import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = 'supabase/migrations/20260810180317_client_browser_pairing.sql';

describe('client PWA to browser pairing contract', () => {
  it('stores only expiring one-time code hashes behind RLS', () => {
    const sql = readFileSync(resolve(repoRoot, migrationPath), 'utf8');

    assert.match(sql, /create table public\.client_browser_pairing_codes/i);
    assert.match(sql, /account_id uuid not null unique references public\.client_accounts/i);
    assert.match(sql, /code_hash bytea not null unique/i);
    assert.doesNotMatch(sql, /pairing_code\s+text\s+not null/i);
    assert.match(sql, /expires_at timestamptz not null/i);
    assert.match(sql, /redeemed_at timestamptz/i);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /revoke all on table public\.client_browser_pairing_codes from public, anon, authenticated/i);
  });

  it('requires a live PWA session and creates a five-minute code', () => {
    const sql = readFileSync(resolve(repoRoot, migrationPath), 'utf8');

    assert.match(sql, /create_client_browser_pairing_code[\s\S]*security definer[\s\S]*set search_path = ''/i);
    assert.match(sql, /client_account_sessions[\s\S]*session\.expires_at > now\(\)/i);
    assert.match(sql, /raise exception 'client_session_invalid'/i);
    assert.match(sql, /interval '5 minutes'/i);
    assert.match(sql, /delete from public\.client_browser_pairing_codes[\s\S]*account_id = account_id_value/i);
    assert.match(sql, /extensions\.digest\([\s\S]*pairing_code_value/i);
  });

  it('locks and consumes the code before issuing an independent client session', () => {
    const sql = readFileSync(resolve(repoRoot, migrationPath), 'utf8');

    assert.match(sql, /redeem_client_browser_pairing_code[\s\S]*set search_path = ''/i);
    assert.match(sql, /code\.redeemed_at is null[\s\S]*code\.expires_at > now\(\)[\s\S]*for update/i);
    assert.match(sql, /set redeemed_at = now\(\)/i);
    assert.match(sql, /insert into public\.client_account_sessions/i);
    assert.match(sql, /extensions\.gen_random_bytes\(32\)/i);
    assert.match(sql, /revoke all on function public\.redeem_client_browser_pairing_code\(text\) from public, anon, authenticated/i);
    assert.match(sql, /grant execute on function public\.redeem_client_browser_pairing_code\(text\) to anon, authenticated/i);
  });

  it('wires the PWA profile, Safari panel and persisted checkout profile together', () => {
    const api = readFileSync(resolve(repoRoot, 'src/shared/api/clientAccountApi.ts'), 'utf8');
    const profile = readFileSync(resolve(repoRoot, 'src/pages/client-platform/ClientPlatformApp.tsx'), 'utf8');
    const catalog = readFileSync(resolve(repoRoot, 'src/app/App.tsx'), 'utf8');
    const checkout = readFileSync(resolve(repoRoot, 'src/features/checkout/CheckoutScreen.tsx'), 'utf8');

    assert.match(api, /redeem_client_browser_pairing_code/);
    assert.match(api, /saveClientSession\(token, session\)/);
    assert.match(profile, /clientSession && \([\s\S]*<ClientPasskeyCard accountId=\{clientSession\.accountId\} \/>/);
    assert.match(profile, /appIsRunningStandalone\(\) && \([\s\S]*<ClientPwaPairingCodeCard \/>/);
    assert.match(catalog, /<ClientBrowserPairingBanner \/>/);
    assert.match(checkout, /restoreClientAccountSession\(\)/);
    assert.match(checkout, /saveClientProfile\(\{ name: session\.name, phone: session\.phone \}\)/);
    assert.match(checkout, /setOrder\(\{ clientName: session\.name, clientPhone: normalizeRussianClientPhone\(session\.phone\) \}\)/);
  });
});
