import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_accept_merchant_order_with_ready_estimate.sql'));
const migration = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';
const api = readFileSync(resolve(repoRoot, 'src/shared/api/restaurantOrdersApi.ts'), 'utf8');
const legacyPanel = readFileSync(resolve(repoRoot, 'src/features/restaurant-admin/OrderDetailsPanel.tsx'), 'utf8');
const businessPanel = readFileSync(resolve(repoRoot, 'src/pages/catalog-admin/RestaurantAdminShell.tsx'), 'utf8');
const picker = readFileSync(resolve(repoRoot, 'src/features/restaurant-admin/MerchantReadyEstimatePicker.tsx'), 'utf8');

describe('merchant acceptance with a ready estimate', () => {
  it('persists acceptance and estimatedReadyAt in one tenant-authorized transaction', () => {
    assert.ok(migrationName, 'merchant acceptance migration must exist');
    assert.match(migration, /create or replace function public\.accept_merchant_order_with_ready_estimate\(/i);
    assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
    assert.match(migration, /auth\.uid\(\) is null/i);
    assert.match(migration, /public\.is_catalog_member\(/i);
    assert.match(migration, /client\.owner_user_id = auth\.uid\(\)/i);
    assert.match(migration, /for update/i);
    assert.match(migration, /current_status[^;]*not in \('new'/i);
    assert.match(migration, /ready_minutes not in \(10, 15, 20, 30\)/i);
    assert.match(migration, /status = 'accepted'/i);
    assert.match(migration, /ready_at_value := changed_at \+ make_interval\(mins => ready_minutes\)/i);
    assert.match(migration, /estimated_ready_at = ready_at_value/i);
    assert.match(migration, /insert into public\.order_status_history/i);
    assert.match(migration, /'MERCHANT_ACCEPTED'/i);
    assert.match(migration, /grant execute on function public\.accept_merchant_order_with_ready_estimate\(uuid, uuid, integer\) to authenticated/i);
  });

  it('uses the atomic acceptance RPC and maps the estimate into the existing order model', () => {
    assert.match(api, /estimatedReadyAt\??: string \| null/);
    assert.match(api, /estimated_ready_at/);
    assert.match(api, /rpc\('accept_merchant_order_with_ready_estimate'/);
    assert.match(api, /ready_minutes: readyMinutes/);
  });

  it('shares one accessible 10\/15\/20\/30 minute picker across both merchant panels', () => {
    assert.match(picker, /\[10, 15, 20, 30\]/);
    assert.match(picker, /Будет готов через/);
    assert.match(picker, /aria-pressed/);
    assert.match(legacyPanel, /<MerchantReadyEstimatePicker/);
    assert.match(businessPanel, /<MerchantReadyEstimatePicker/);
    assert.match(legacyPanel, /onStatus\(nextStatusAction\.status, undefined, readyMinutes\)/);
    assert.match(businessPanel, /onStatusChange\(order, 'accepted', readyMinutes\)/);
  });
});
