import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { appUrl } from '../../e2e/visual/config.mjs';
import { waitFor } from '../../e2e/visual/backend.mjs';

test('visual E2E keeps one configurable base URL for every real UI route', () => {
  assert.equal(appUrl({ baseUrl: 'https://wayyaam.ru' }, '/driver/orders'), 'https://wayyaam.ru/#/driver/orders');
  assert.equal(
    appUrl({ baseUrl: 'http://localhost:5173' }, 'r/wayyaam-test-restaurant'),
    'http://localhost:5173/#/r/wayyaam-test-restaurant'
  );
});

test('backend polling completes only after the observed state is true', async () => {
  let reads = 0;
  const state = await waitFor('observable state', async () => ({ completed: ++reads === 3 }), (value) => value.completed, {
    timeout: 1_000,
    interval: 1
  });
  assert.deepEqual(state, { completed: true });
  assert.equal(reads, 3);
});

test('backend polling rejects instead of printing a false PASS', async () => {
  await assert.rejects(
    waitFor('never completed', async () => ({ completed: false }), (value) => value.completed, { timeout: 5, interval: 1 }),
    /состояние не наступило/
  );
});

test('visual control plane is restricted to E2E actors and production aggregates are read-only', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260807130000_visual_e2e_control_plane.sql', import.meta.url), 'utf8');
  assert.match(sql, /if not public\.is_wayyaam_e2e_actor\(\) then raise exception 'e2e_actor_required'/i);
  assert.match(sql, /where not coalesce\(is_test_order, false\)/i);
  assert.match(sql, /where not coalesce\(is_test, false\)/i);
  assert.match(sql, /revoke all on function public\.reset_wayyaam_e2e_state\(\) from public, anon/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
});
