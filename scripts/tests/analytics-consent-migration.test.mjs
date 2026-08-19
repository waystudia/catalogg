import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('public analytics migration is consent-safe and write-only', async () => {
  const migrations = await readdir(new URL('../../supabase/migrations/', import.meta.url));
  const migrationName = migrations.find((name) => name.endsWith('_add_consent_gated_public_analytics.sql'));
  assert.ok(migrationName, 'analytics migration must exist');

  const sql = await readFile(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.public_analytics_events from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.record_public_analytics_event\(uuid, text, text\) to anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.delete_public_analytics_session\(uuid\) to anon, authenticated/i);
  assert.match(sql, /event_name in \('analytics_enabled', 'page_view'\)/i);
  assert.match(sql, /occurred_at < now\(\) - interval '90 days'/i);
  assert.doesNotMatch(sql, /ip_address|user_agent|email|phone|address/i);
});
