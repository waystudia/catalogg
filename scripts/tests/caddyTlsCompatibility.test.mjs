import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caddyfile = await readFile(new URL('../../infra/caddy/Caddyfile', import.meta.url), 'utf8');

test('production TLS avoids the hybrid handshake that stalls mobile clients', () => {
  const siteBlocks = caddyfile.match(/tls \{\s+curves x25519\s+\}/g) ?? [];

  assert.equal(siteBlocks.length, 2);
  assert.doesNotMatch(caddyfile, /x25519mlkem768/);
});

test('external Unsplash images are fetched through the Russian production endpoint', () => {
  assert.match(caddyfile, /handle_path \/media\/unsplash\/\*/);
  assert.match(caddyfile, /reverse_proxy https:\/\/images\.unsplash\.com/);
  assert.match(caddyfile, /header_up Host images\.unsplash\.com/);
});
