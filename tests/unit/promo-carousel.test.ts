import { describe, expect, it } from 'vitest';
import {
  getPromoAutoAdvanceDelay,
  getPromoLoopResetIndex,
  normalizePromoDisplayDurationMs
} from '../../src/features/client-platform/promoCarousel';

describe('promo carousel timing', () => {
  it('keeps an active video centered until one complete playback ends', () => {
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 2,
      isVideo: true,
      videoPlayedToEnd: false,
      displayDurationMs: 8000
    })).toBeNull();
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 2,
      isVideo: true,
      videoPlayedToEnd: true,
      displayDurationMs: 8000
    })).toBe(8000);
  });

  it('uses each banner interval for images and never advances a single banner', () => {
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 2,
      isVideo: false,
      videoPlayedToEnd: false,
      displayDurationMs: 9000
    })).toBe(9000);
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 1,
      isVideo: false,
      videoPlayedToEnd: false,
      displayDurationMs: 9000
    })).toBeNull();
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 1,
      isVideo: true,
      videoPlayedToEnd: true,
      displayDurationMs: 9000
    })).toBeNull();
  });

  it('normalizes unsafe or missing timing values to the supported range', () => {
    expect(normalizePromoDisplayDurationMs(undefined)).toBe(5000);
    expect(normalizePromoDisplayDurationMs(Number.NaN)).toBe(5000);
    expect(normalizePromoDisplayDurationMs(500)).toBe(2000);
    expect(normalizePromoDisplayDurationMs(120000)).toBe(60000);
    expect(normalizePromoDisplayDurationMs(7450)).toBe(7450);
  });
});

describe('promo carousel infinite loop', () => {
  it('resets only cloned edge slides to their matching real slide', () => {
    expect(getPromoLoopResetIndex(0, 3)).toBe(3);
    expect(getPromoLoopResetIndex(4, 3)).toBe(1);
    expect(getPromoLoopResetIndex(1, 3)).toBeNull();
    expect(getPromoLoopResetIndex(3, 3)).toBeNull();
    expect(getPromoLoopResetIndex(0, 2)).toBe(2);
    expect(getPromoLoopResetIndex(3, 2)).toBe(1);
  });

  it('does not reset when the carousel has fewer than two banners', () => {
    expect(getPromoLoopResetIndex(0, 0)).toBeNull();
    expect(getPromoLoopResetIndex(0, 1)).toBeNull();
    expect(getPromoLoopResetIndex(2, 1)).toBeNull();
  });
});
