import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatOrderPaymentMethodMarker,
  getOrderPaymentMethod,
  getVisibleAdminOrderComment
} from './orderPresentation';

describe('order payment presentation', () => {
  it('stores and reads a bank transfer marker', () => {
    const marker = formatOrderPaymentMethodMarker('bank_transfer');

    assert.equal(marker, '[payment_method:bank_transfer]');
    assert.equal(getOrderPaymentMethod(marker), 'bank_transfer');
  });

  it('defaults legacy orders to cash', () => {
    assert.equal(getOrderPaymentMethod('Позвонить заранее'), 'cash');
  });

  it('hides the technical payment marker from the visible comment', () => {
    const comment = [
      '[payment_method:cash]',
      'Без лука'
    ].join('\n');

    assert.equal(getVisibleAdminOrderComment(comment), 'Без лука');
  });
});
