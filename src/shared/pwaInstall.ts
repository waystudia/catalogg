export type InstallDevice = 'ios' | 'android' | null;

export const installGuideDismissedUntilKey = 'wayyaam:pwa-install-guide-dismissed-until:v2';

type DeviceSignals = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
};

type InstallGuideSignals = DeviceSignals & {
  viewportWidth: number;
};

export const detectInstallDevice = ({ userAgent, platform, maxTouchPoints }: DeviceSignals): InstallDevice => {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
  return null;
};

export const resolveInstallGuideDevice = (signals: InstallGuideSignals): InstallDevice => {
  const detectedDevice = detectInstallDevice(signals);
  if (detectedDevice) return detectedDevice;
  if (signals.viewportWidth > 720) return null;
  return /mac/i.test(signals.platform) ? 'ios' : 'android';
};

export const shouldShowInstallGuide = ({
  device,
  installed,
  dismissedUntil,
  now
}: {
  device: InstallDevice;
  installed: boolean;
  dismissedUntil: number;
  now: number;
}) => Boolean(device && !installed && dismissedUntil <= now);
