import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildYandexTileUrl,
  YANDEX_NAVIGATOR_FREE_DAILY_TRANSITION_LIMIT,
  YANDEX_TILES_FREE_RPS_LIMIT
} from './yandexMapsApi';

describe('Yandex Maps API preparation', () => {
  it('builds a roadmap tile request with the required browser key', () => {
    assert.equal(
      buildYandexTileUrl({ x: 38048, y: 24596, z: 16, scale: 2 }, 'tiles-key'),
      'https://tiles.api-maps.yandex.ru/v1/tiles/?x=38048&y=24596&z=16&lang=ru_RU&l=map&apikey=tiles-key&scale=2'
    );
  });

  it('keeps the documented free limits explicit', () => {
    assert.equal(YANDEX_TILES_FREE_RPS_LIMIT, 30);
    assert.equal(YANDEX_NAVIGATOR_FREE_DAILY_TRANSITION_LIMIT, 5_000);
  });

  it('rejects zoom levels outside the Tiles API range', () => {
    assert.throws(() => buildYandexTileUrl({ x: 0, y: 0, z: 21 }, 'tiles-key'), /z/);
  });
});
