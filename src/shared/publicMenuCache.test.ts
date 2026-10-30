import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicMenuCache } from './publicMenuCache';

test('public menu loads are coalesced and cached until expiry without sharing mutable objects', async () => {
  let time = 0; let calls = 0;
  const cache = createPublicMenuCache<{ price: number }>(15, () => time);
  const load = async () => ({ price: ++calls });
  const [a, b] = await Promise.all([cache.get('menu', load), cache.get('menu', load)]);
  a.price = 999;
  assert.equal(b.price, 1);
  assert.deepEqual(await cache.get('menu', load), { price: 1 });
  time = 15;
  assert.deepEqual(await cache.get('menu', load), { price: 2 });
});
test('a rejected load can be retried and invalidation discards an in-flight result', async () => {
  const cache = createPublicMenuCache<number>();
  await assert.rejects(cache.get('menu', async () => { throw new Error('offline'); }));
  let resolve!: (value: number) => void;
  const old = cache.get('menu', () => new Promise<number>(done => { resolve = done; }));
  await Promise.resolve(); cache.clear();
  assert.equal(await cache.get('menu', async () => 2), 2);
  resolve(1); await old;
  assert.equal(await cache.get('menu', async () => 3), 2);
});
