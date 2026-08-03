import { describe, expect, it } from 'vitest';

import {
  detectInstallDevice,
  installGuideDismissedUntilKey,
  resolveInstallGuideDevice,
  shouldShowInstallGuide
} from '../../src/shared/pwaInstall';

describe('first-time install guide', () => {
  it('detects explicit iOS, Android and touch-iPad signals', () => {
    expect(detectInstallDevice({ userAgent: 'Android', platform: 'Linux', maxTouchPoints: 1 })).toBe('android');
    expect(detectInstallDevice({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 })).toBe('ios');
    expect(detectInstallDevice({ userAgent: 'Safari', platform: 'MacIntel', maxTouchPoints: 2 })).toBe('ios');
    expect(detectInstallDevice({ userAgent: 'Safari', platform: 'MacIntel', maxTouchPoints: 1 })).toBeNull();
    expect(detectInstallDevice({ userAgent: 'Safari', platform: 'Linux', maxTouchPoints: 5 })).toBeNull();
  });

  it('falls back only for a narrow embedded browser and keeps the 720px boundary', () => {
    expect(resolveInstallGuideDevice({ userAgent: 'Embedded', platform: 'MacIntel', maxTouchPoints: 0, viewportWidth: 720 })).toBe('ios');
    expect(resolveInstallGuideDevice({ userAgent: 'Embedded', platform: 'Linux', maxTouchPoints: 0, viewportWidth: 720 })).toBe('android');
    expect(resolveInstallGuideDevice({ userAgent: 'Embedded', platform: 'Linux', maxTouchPoints: 0, viewportWidth: 721 })).toBeNull();
    expect(resolveInstallGuideDevice({ userAgent: 'Android', platform: 'Linux', maxTouchPoints: 0, viewportWidth: 1280 })).toBe('android');
  });

  it('shows once only when installation and prior completion do not block it', () => {
    expect(installGuideDismissedUntilKey).toBe('wayyaam:pwa-install-guide-dismissed-until:v2');
    expect(shouldShowInstallGuide({ device: 'ios', installed: false, dismissedUntil: 100, now: 100 })).toBe(true);
    expect(shouldShowInstallGuide({ device: 'ios', installed: true, dismissedUntil: 0, now: 100 })).toBe(false);
    expect(shouldShowInstallGuide({ device: null, installed: false, dismissedUntil: 0, now: 100 })).toBe(false);
    expect(shouldShowInstallGuide({ device: 'android', installed: false, dismissedUntil: 101, now: 100 })).toBe(false);
  });
});
