import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260816020000_add_legacy_dish_variant_cards.sql', import.meta.url),
  'utf8'
);
const catalogAdapter = readFileSync(new URL('../../src/shared/supabase.ts', import.meta.url), 'utf8');

test('dish variant card metadata persists in legacy and universal catalogs', () => {
  assert.match(migration, /add column if not exists publish_choice_cards boolean not null default false/);
  assert.match(migration, /add column if not exists generated_from_choice text/);
  assert.match(migration, /foreign key \(generated_from_choice\)[\s\S]*on delete cascade/);
  assert.match(migration, /unique index if not exists product_generated_choice_unique_idx/);
  assert.match(catalogAdapter, /'publish_choice_cards'/);
  assert.match(catalogAdapter, /'generated_from_choice'/);
  assert.match(catalogAdapter, /'generated_choice_index'/);
});
