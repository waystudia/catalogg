export const normalizeClientPairingCode = (value: string) =>
  value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);

export const formatClientPairingCode = (value: string) =>
  normalizeClientPairingCode(value).replace(/(.{4})(?=.)/g, '$1-');

export const isMobileBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const shouldShowClientBrowserPairingPrompt = (input: {
  standalone: boolean;
  mobile: boolean;
  hasSession: boolean;
  dismissed: boolean;
}) => !input.standalone && input.mobile && !input.hasSession && !input.dismissed;
