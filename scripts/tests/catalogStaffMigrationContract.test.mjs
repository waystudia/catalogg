import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260812223500_add_catalog_staff_workflow.sql',
  import.meta.url
);
const assignmentCompatibilityMigrationUrl = new URL(
  '../../supabase/migrations/20260813020133_fix_catalog_order_assignment_membership_signature.sql',
  import.meta.url
);

test('catalog staff migration keeps roles tenant-scoped and assignments atomic', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create table if not exists public\.catalog_staff_roles/i);
  assert.match(sql, /create table if not exists public\.catalog_staff_memberships/i);
  assert.match(sql, /primary key \(catalog_id, user_id\)/i);
  assert.match(sql, /create table if not exists public\.order_work_assignments/i);
  assert.match(sql, /where state in \('offered', 'accepted'\)/i);
  assert.match(sql, /create or replace function public\.accept_catalog_order_assignment/i);
  assert.match(sql, /expected_version/i);
  assert.match(sql, /create or replace function public\.escalate_catalog_order_assignments/i);
  assert.match(sql, /owner_fallback/i);
  assert.match(sql, /create trigger route_new_grocery_order/i);
  assert.match(sql, /business_type = 'grocery'/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on function public\.link_catalog_staff_by_email/i);
});

test('catalog order assignment reads use the existing explicit membership signature', async () => {
  const sql = await readFile(assignmentCompatibilityMigrationUrl, 'utf8');

  assert.match(sql, /create or replace function public\.get_catalog_order_assignments/i);
  assert.match(
    sql,
    /public\.is_catalog_member\([\s\S]*target_catalog_id,[\s\S]*array\['owner', 'admin', 'editor', 'viewer'\]::public\.catalog_role\[\]/i
  );
  assert.doesNotMatch(sql, /public\.is_catalog_member\(target_catalog_id\)/i);
  assert.match(sql, /coalesce\(auth_user\.email::text, profile\.email, ''\)/i);
  assert.match(sql, /revoke all on function public\.get_catalog_order_assignments\(uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_catalog_order_assignments\(uuid\) to authenticated, service_role/i);
});
