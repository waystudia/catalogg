import { describe, expect, it } from 'vitest';
import {
  getPromoAutoAdvanceDelay,
  getPromoLoopResetIndex
} from '../../src/features/client-platform/promoCarousel';

describe('promo carousel timing', () => {
  it('keeps an active video centered until one complete playback ends', () => {
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 2,
      isVideo: true,
      videoPlayedToEnd: false
    })).toBeNull();
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 2,
      isVideo: true,
      videoPlayedToEnd: true
    })).toBe(1200);
  });

  it('uses the normal interval for images and never advances a single banner', () => {
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 2,
      isVideo: false,
      videoPlayedToEnd: false
    })).toBe(5000);
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 1,
      isVideo: false,
      videoPlayedToEnd: false
    })).toBeNull();
    expect(getPromoAutoAdvanceDelay({
      bannerCount: 1,
      isVideo: true,
      videoPlayedToEnd: true
    })).toBeNull();
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
