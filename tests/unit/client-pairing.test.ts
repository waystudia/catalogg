import { describe, expect, it } from 'vitest';
import {
  formatClientPairingCode,
  normalizeClientPairingCode,
  shouldShowClientBrowserPairingPrompt
} from '../../src/features/client-pairing/clientPairingPresentation';

describe('client browser pairing presentation', () => {
  it('normalizes pasted codes and groups them for readable manual entry', () => {
    expect(normalizeClientPairingCode('a1b2-c3d4 e5f6 extra')).toBe('A1B2C3D4E5F6');
    expect(formatClientPairingCode('a1b2c3d4e5f6')).toBe('A1B2-C3D4-E5F6');
  });

  it('shows the prompt only in a mobile external browser without a client session', () => {
    expect(shouldShowClientBrowserPairingPrompt({
      standalone: false,
      mobile: true,
      hasSession: false,
      dismissed: false
    })).toBe(true);

    expect(shouldShowClientBrowserPairingPrompt({
      standalone: true,
      mobile: true,
      hasSession: false,
      dismissed: false
    })).toBe(false);

    expect(shouldShowClientBrowserPairingPrompt({
      standalone: false,
      mobile: true,
      hasSession: true,
      dismissed: false
    })).toBe(false);

    expect(shouldShowClientBrowserPairingPrompt({
      standalone: false,
      mobile: true,
      hasSession: false,
      dismissed: true
    })).toBe(false);
  });
});
