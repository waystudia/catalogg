import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PHOTO_QUALITY_SETTINGS,
  getPhotoQualityFilter,
  normalizePhotoQualitySettings
} from './photoQuality';

test('photo quality defaults preserve original images', () => {
  assert.equal(getPhotoQualityFilter(DEFAULT_PHOTO_QUALITY_SETTINGS), 'none');
});

test('photo quality settings are normalized to supported ranges', () => {
  assert.deepEqual(
    normalizePhotoQualitySettings({
      enabled: true,
      saturation: 180,
      brightness: -140,
      contrast: 20,
      colorfulness: 15,
      sharpness: 130,
      warmth: Number.NaN
    }),
    {
      enabled: true,
      saturation: 100,
      brightness: -100,
      contrast: 20,
      colorfulness: 15,
      sharpness: 100,
      warmth: 0
    }
  );
});

test('enabled settings produce a display-only css filter', () => {
  const filter = getPhotoQualityFilter({
    ...DEFAULT_PHOTO_QUALITY_SETTINGS,
    enabled: true,
    saturation: 25,
    brightness: 10,
    contrast: 20,
    warmth: 5
  });

  assert.match(filter, /brightness\(/);
  assert.match(filter, /contrast\(/);
  assert.match(filter, /saturate\(/);
  assert.match(filter, /hue-rotate\(/);
});

