import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectInstallDevice, resolveInstallGuideDevice, shouldShowInstallGuide } from './pwaInstall';

describe('PWA install guide targeting', () => {
  it('selects the matching phone instructions', () => {
    assert.equal(detectInstallDevice({ userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 }), 'ios');
    assert.equal(detectInstallDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5 }), 'android');
    assert.equal(detectInstallDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), null);
    assert.equal(detectInstallDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
  });

  it('does not interrupt installed apps or a recent dismissal', () => {
    assert.equal(shouldShowInstallGuide({ device: 'ios', installed: false, dismissedUntil: 0, now: 100 }), true);
    assert.equal(shouldShowInstallGuide({ device: 'android', installed: true, dismissedUntil: 0, now: 100 }), false);
    assert.equal(shouldShowInstallGuide({ device: 'ios', installed: false, dismissedUntil: 101, now: 100 }), false);
    assert.equal(shouldShowInstallGuide({ device: null, installed: false, dismissedUntil: 0, now: 100 }), false);
  });

  it('still opens the first-time guide in a narrow embedded browser with incomplete device signals', () => {
    assert.equal(resolveInstallGuideDevice({
      userAgent: 'EmbeddedBrowser',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      viewportWidth: 386
    }), 'ios');
    assert.equal(resolveInstallGuideDevice({
      userAgent: 'EmbeddedBrowser',
      platform: 'Linux',
      maxTouchPoints: 0,
      viewportWidth: 386
    }), 'android');
    assert.equal(resolveInstallGuideDevice({
      userAgent: 'Mozilla/5.0 (Macintosh)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      viewportWidth: 1280
    }), null);
  });
});
