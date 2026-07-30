import { describe, expect, it } from 'vitest';
import { getPromoAutoAdvanceDelay } from '../../src/features/client-platform/promoCarousel';

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
