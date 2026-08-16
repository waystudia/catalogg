import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationsUrl = new URL('../../supabase/migrations/', import.meta.url);
const migrationName = readdirSync(migrationsUrl).find((name) => name.endsWith('_add_dish_choice_card_options.sql'));
const catalogAdapter = readFileSync(new URL('../../src/shared/supabase.ts', import.meta.url), 'utf8');

test('additional card variants persist in both legacy and universal catalogs', () => {
  assert.ok(migrationName, 'dish choice card options migration is required');
  const migration = readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
  assert.match(migration, /alter table public\.product[\s\S]*add column if not exists choice_card_options jsonb/);
  assert.match(migration, /jsonb_typeof\(choice_card_options\) = 'array'/);
  assert.match(catalogAdapter, /'choice_card_options'/);
});
