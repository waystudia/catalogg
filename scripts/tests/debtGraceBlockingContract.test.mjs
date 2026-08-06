import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_restaurant_driver_debt_grace_blocking.sql'))
  .sort()
  .at(-1);
const migration = migrationName
  ? readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')
  : '';
const activationMigration = readFileSync(
  new URL('../../supabase/migrations/20260805163750_restaurant_legal_activation_mvp.sql', import.meta.url),
  'utf8'
);

test('restaurant and driver debt use the same server-controlled warning, limit and grace period', () => {
  assert.ok(migrationName, 'debt grace migration must exist');
  assert.match(migration, /clients[\s\S]*debt_limit_reached_at timestamptz/i);
  assert.match(migration, /drivers[\s\S]*debt_limit_reached_at timestamptz/i);
  assert.match(migration, /debt_warning_amount[\s\S]*4000/i);
  assert.match(migration, /debt_limit_amount[\s\S]*5000/i);
  assert.match(migration, /grace_hours[\s\S]*24/i);
  assert.match(migration, /get_current_billing_debt_status/i);
});

test('only WayYaam platform debt counts toward the 5 000 ₽ limit', () => {
  assert.match(migration, /ledger_scope\s*=\s*'platform_debt'/i);
  assert.doesNotMatch(
    migration.match(/function public\.billing_debt_is_blocked\([\s\S]*?\$\$;/i)?.[0] ?? '',
    /courier_payable|free_delivery_driver_payout/i
  );
});

test('debt below the limit clears the timer and a limit crossing starts it once', () => {
  assert.match(migration, /debt_limit_reached_at\s*=\s*case[\s\S]*resolved_amount\s*<\s*policy\.debt_limit_amount\s*then null/i);
  assert.match(migration, /coalesce\([^\n]*debt_limit_reached_at[^\n]*now\(\)/i);
  assert.match(migration, /coalesce\(debt_limit_reached_at,\s*now\(\)\)\s*\+\s*make_interval\(hours\s*=>\s*policy\.grace_hours\)/i);
});

test('restaurant debt blocks new orders after grace but never mutates an existing order', () => {
  assert.match(migration, /function public\.can_catalog_accept_real_orders\([\s\S]*not public\.billing_debt_is_blocked\('restaurant'/i);
  assert.match(activationMigration, /before insert on public\.orders/i);
  assert.doesNotMatch(migration, /before update on public\.orders[\s\S]*debt/i);
});

test('driver debt blocks only taking an unassigned delivery and keeps current delivery progress available', () => {
  const assignmentGate = migration.match(
    /function public\.enforce_driver_debt_assignment_gate\([\s\S]*?create trigger deliveries_block_debt_assignment[\s\S]*?;/i
  )?.[0] ?? '';
  assert.match(assignmentGate, /old\.driver_id is null[\s\S]*new\.driver_id is not null/i);
  assert.match(assignmentGate, /billing_debt_is_blocked\('driver'/i);
  assert.match(assignmentGate, /driver_debt_limit_exceeded/i);
  assert.doesNotMatch(migration, /function public\.(update_delivery_progress|complete_driver_delivery)[\s\S]*driver_debt_limit_exceeded/i);
});

test('debt functions are not writable or callable by anonymous users', () => {
  assert.match(migration, /revoke all on function public\.get_current_billing_debt_status\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_current_billing_debt_status\(\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.billing_debt_is_blocked\(text, uuid\) from public, anon, authenticated/i);
});
