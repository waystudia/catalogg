import type { CurrentClientLegalState } from '../../shared/api/clientAccountApi';

export type CheckoutLegalChoices = {
  acceptedAgreement: boolean;
  acceptedPersonalData: boolean;
  acceptedAdvertising: boolean;
  acceptedOrderTransfer: boolean;
};

export const emptyClientLegalState: CurrentClientLegalState = {
  registered: false,
  userAgreementCurrent: false,
  clientConsentCurrent: false,
  orderTransferConsentCurrent: false
};

export const hasMissingCheckoutLegalAcceptance = (
  state: CurrentClientLegalState,
  choices: CheckoutLegalChoices
) => (
  (!state.userAgreementCurrent && !choices.acceptedAgreement)
  || (!state.clientConsentCurrent && !choices.acceptedPersonalData)
  || (!state.orderTransferConsentCurrent && !choices.acceptedOrderTransfer)
);
