import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caddyfile = await readFile(new URL('../../infra/caddy/Caddyfile', import.meta.url), 'utf8');

test('production TLS avoids the hybrid handshake that stalls mobile clients', () => {
  const siteBlocks = caddyfile.match(/tls \{\s+curves x25519\s+\}/g) ?? [];

  assert.equal(siteBlocks.length, 2);
  assert.doesNotMatch(caddyfile, /x25519mlkem768/);
});

test('production disables cached HTTP/3 alternatives on unreliable mobile routes', () => {
  assert.match(caddyfile, /^\{\s+servers \{\s+protocols h1 h2\s+\}\s+\}/);
  assert.equal((caddyfile.match(/header Alt-Svc "clear"/g) ?? []).length, 2);
  assert.match(caddyfile, /@appShell path \/ \/index\.html \/sw\.js \/manifest\.webmanifest\s+header @appShell Cache-Control "no-store"/);
});

test('external Unsplash images are fetched through the Russian production endpoint', () => {
  assert.match(caddyfile, /handle_path \/media\/unsplash\/\*/);
  assert.match(caddyfile, /reverse_proxy https:\/\/images\.unsplash\.com/);
  assert.match(caddyfile, /header_up Host images\.unsplash\.com/);
});

test('the TLS MSS workaround is idempotent and restored after every server boot', async () => {
  const [script, service] = await Promise.all([
    readFile(new URL('../../infra/systemd/configure-wayyaam-tls-mss.sh', import.meta.url), 'utf8'),
    readFile(new URL('../../infra/systemd/wayyaam-tls-mss.service', import.meta.url), 'utf8')
  ]);

  assert.match(script, /iptables -t mangle -C FORWARD[\s\S]*--sport 443[\s\S]*--set-mss 1200/);
  assert.match(script, /iptables -t mangle -I FORWARD 1[\s\S]*--sport 443[\s\S]*--set-mss 1200/);
  assert.match(service, /After=network-online\.target docker\.service/);
  assert.match(service, /ExecStart=\/usr\/local\/sbin\/configure-wayyaam-tls-mss/);
  assert.match(service, /RemainAfterExit=yes/);
});
