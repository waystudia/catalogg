import { describe, expect, it } from 'vitest';
import { shouldShowCheckoutConsent } from '../../src/features/checkout/CheckoutScreen';

describe('checkout consent visibility', () => {
  it('shows consent for a new guest and hides it for an existing signed-in client', () => {
    expect(shouldShowCheckoutConsent(false)).toBe(true);
    expect(shouldShowCheckoutConsent(true)).toBe(false);
  });
});
