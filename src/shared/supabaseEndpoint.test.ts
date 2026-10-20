import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSupabaseEndpoint } from './supabaseEndpoint';

test('uses the same origin API gateway on WayYaam production hosts', () => {
  assert.equal(
    resolveSupabaseEndpoint('https://api.wayyaam.ru', 'https://wayyaam.ru'),
    'https://wayyaam.ru/api'
  );
  assert.equal(
    resolveSupabaseEndpoint('https://api.wayyaam.ru', 'https://www.wayyaam.ru/'),
    'https://www.wayyaam.ru/api'
  );
});

test('keeps the configured API URL for previews and local development', () => {
  assert.equal(
    resolveSupabaseEndpoint('https://api.wayyaam.ru', 'http://127.0.0.1:4175'),
    'https://api.wayyaam.ru'
  );
  assert.equal(resolveSupabaseEndpoint(undefined, 'http://127.0.0.1:4175'), undefined);
});
