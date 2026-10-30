import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupabaseBrowserUrl } from './supabaseBrowserUrl';

test('WayYaam browser uses its HTTPS API proxy on either public hostname', () => {
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'https://wayyaam.ru'), 'https://wayyaam.ru/api');
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru/', 'https://www.wayyaam.ru'), 'https://www.wayyaam.ru/api');
});
test('local, alternate project and missing configuration keep their existing endpoints', () => {
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'http://localhost:5173'), 'https://api.wayyaam.ru');
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'https://wayyaam.ru.example.com'), 'https://api.wayyaam.ru');
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru', 'http://wayyaam.ru'), 'https://api.wayyaam.ru');
  assert.equal(resolveSupabaseBrowserUrl('https://other.supabase.co', 'https://wayyaam.ru'), 'https://other.supabase.co');
  assert.equal(resolveSupabaseBrowserUrl(undefined, 'https://wayyaam.ru'), undefined);
  assert.equal(resolveSupabaseBrowserUrl('https://api.wayyaam.ru'), 'https://api.wayyaam.ru');
});
