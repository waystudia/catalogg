import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { CheckoutLegalConsents } from '../../src/features/checkout/CheckoutLegalConsents';
import {
  emptyClientLegalState,
  hasMissingCheckoutLegalAcceptance
} from '../../src/features/checkout/checkoutLegalState';

const emptyChoices = {
  acceptedAgreement: false,
  acceptedPersonalData: false,
  acceptedAdvertising: false,
  acceptedOrderTransfer: false
};

test('checkout hides every legal checkbox after the current releases were accepted once', async () => {
  const screen = await render(
    <CheckoutLegalConsents
      state={{
        registered: true,
        userAgreementCurrent: true,
        clientConsentCurrent: true,
        orderTransferConsentCurrent: true
      }}
      choices={emptyChoices}
      onChange={vi.fn()}
    />
  );

  await expect.element(screen.getByRole('region', { name: 'Согласия для заказа' })).not.toBeInTheDocument();
  expect(hasMissingCheckoutLegalAcceptance({
    registered: true,
    userAgreementCurrent: true,
    clientConsentCurrent: true,
    orderTransferConsentCurrent: true
  }, emptyChoices)).toBe(false);
});

test('checkout asks only for a missing or newly released consent', async () => {
  const onChange = vi.fn();
  const screen = await render(
    <CheckoutLegalConsents
      state={{
        registered: true,
        userAgreementCurrent: true,
        clientConsentCurrent: true,
        orderTransferConsentCurrent: false
      }}
      choices={emptyChoices}
      onChange={onChange}
    />
  );

  expect(screen.getByRole('checkbox').elements()).toHaveLength(1);
  await expect.element(screen.getByText(/передавать данные выбранному бизнесу/u)).toBeVisible();
  await expect.element(screen.getByText(/пользовательское соглашение/u)).not.toBeInTheDocument();
  await screen.getByRole('checkbox').click();
  expect(onChange).toHaveBeenCalledExactlyOnceWith('acceptedOrderTransfer', true);
});

test('a new guest or account sees separate required choices and optional advertising', async () => {
  const screen = await render(
    <CheckoutLegalConsents state={emptyClientLegalState} choices={emptyChoices} onChange={vi.fn()} />
  );

  expect(screen.getByRole('checkbox').elements()).toHaveLength(4);
  await expect.element(screen.getByText(/рекламные сообщения/u)).toBeVisible();
});
