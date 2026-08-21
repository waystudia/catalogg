import type { CurrentClientLegalState } from '../../shared/api/clientAccountApi';
import { legalDocuments } from '../../shared/legalDocuments';
import type { CheckoutLegalChoices } from './checkoutLegalState';

export function CheckoutLegalConsents({
  state,
  choices,
  onChange,
  businessLabel = 'выбранному бизнесу'
}: {
  state: CurrentClientLegalState | null;
  choices: CheckoutLegalChoices;
  onChange: (choice: keyof CheckoutLegalChoices, value: boolean) => void;
  businessLabel?: string;
}) {
  if (!state) return null;
  const showAgreement = !state.userAgreementCurrent;
  const showPersonalData = !state.clientConsentCurrent;
  const showOrderTransfer = !state.orderTransferConsentCurrent;
  if (!showAgreement && !showPersonalData && !showOrderTransfer) return null;

  return (
    <section className="legal-checkboxes" aria-label="Согласия для заказа">
      {showAgreement && (
        <label className="legal-checkbox">
          <input
            type="checkbox"
            checked={choices.acceptedAgreement}
            onChange={(event) => onChange('acceptedAgreement', event.target.checked)}
          />
          <span>Принимаю <a href={legalDocuments.agreement} target="_blank" rel="noreferrer">пользовательское соглашение</a>.</span>
        </label>
      )}
      {showPersonalData && (
        <label className="legal-checkbox">
          <input
            type="checkbox"
            checked={choices.acceptedPersonalData}
            onChange={(event) => onChange('acceptedPersonalData', event.target.checked)}
          />
          <span>Даю <a href={legalDocuments.clientConsent} target="_blank" rel="noreferrer">согласие на обработку персональных данных</a>.</span>
        </label>
      )}
      {(showAgreement || showPersonalData) && !state.registered && (
        <label className="legal-checkbox">
          <input
            type="checkbox"
            checked={choices.acceptedAdvertising}
            onChange={(event) => onChange('acceptedAdvertising', event.target.checked)}
          />
          <span>Согласен получать <a href={legalDocuments.advertisingConsent} target="_blank" rel="noreferrer">рекламные сообщения</a> (необязательно).</span>
        </label>
      )}
      {showOrderTransfer && (
        <label className="legal-checkbox">
          <input
            type="checkbox"
            checked={choices.acceptedOrderTransfer}
            onChange={(event) => onChange('acceptedOrderTransfer', event.target.checked)}
          />
          <span>Разрешаю <a href={legalDocuments.orderTransferConsent} target="_blank" rel="noreferrer">передавать данные {businessLabel} и назначенному водителю</a> для исполнения заказов.</span>
        </label>
      )}
    </section>
  );
}
