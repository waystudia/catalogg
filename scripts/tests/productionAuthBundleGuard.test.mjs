import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const deployHook = readFileSync(resolve(repoRoot, 'scripts/deploy-wayyaam-static.sh'), 'utf8');
const publicGuard = readFileSync(
  resolve(repoRoot, '.agents/skills/wayyaam-production-white-screen-guard/scripts/check-public-production.sh'),
  'utf8'
);

test('production release and public smoke checks fail closed without Supabase browser configuration', () => {
  for (const source of [deployHook, publicGuard]) {
    assert.match(source, /api\.wayyaam\.ru/);
    assert.match(source, /sb_publishable_/);
    assert.match(source, /browser-safe Supabase key/);
  }
});
