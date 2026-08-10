import { Fingerprint, ShoppingBag } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  ClientBrowserPairingBanner,
  ClientPasskeyRegistrationDialog,
  ClientPasskeyReturnPanel
} from './ClientPairing';

type PreviewMode = 'checkout' | 'safari' | 'pwa';

const fakeSession = {
  accountId: '00000000-0000-4000-8000-000000000000',
  name: 'Клиент WayYaam',
  phone: '+79280000000',
  expiresAt: 'infinity'
};

export function ClientPasskeyPreview() {
  const { mode = 'checkout' } = useParams<{ mode: PreviewMode }>();
  const activeMode: PreviewMode = mode === 'safari' || mode === 'pwa' ? mode : 'checkout';

  return (
    <main className="client-passkey-preview-page">
      <header className="client-passkey-preview-page__header">
        <span className="client-passkey-preview-page__brand">
          <Fingerprint aria-hidden="true" />
          WayYaam
        </span>
        <span className="client-passkey-preview-page__cart"><ShoppingBag aria-hidden="true" /> 1</span>
      </header>

      <nav className="client-passkey-preview-page__nav" aria-label="Экраны входа по биометрии">
        <Link className={activeMode === 'checkout' ? 'is-active' : ''} to="/__passkey-preview/checkout">Заказ</Link>
        <Link className={activeMode === 'safari' ? 'is-active' : ''} to="/__passkey-preview/safari">Safari</Link>
        <Link className={activeMode === 'pwa' ? 'is-active' : ''} to="/__passkey-preview/pwa">PWA</Link>
      </nav>

      <section className="client-passkey-preview-page__content">
        {activeMode === 'checkout' && (
          <>
            <span className="client-passkey-preview-page__eyebrow">Оформление заказа</span>
            <h1>Ваш заказ почти оформлен</h1>
            <p>Контактные данные проверены. Осталось подтвердить оформление.</p>
            <ClientPasskeyRegistrationDialog open registerPasskey={async () => undefined} onContinue={() => undefined} />
          </>
        )}

        {activeMode === 'safari' && (
          <>
            <span className="client-passkey-preview-page__eyebrow">Меню ресторана</span>
            <h1>Закажите любимые блюда</h1>
            <p>Ссылка открыта в браузере. WayYaam поможет продолжить с вашим профилем.</p>
            <ClientBrowserPairingBanner
              standalone={false}
              mobile
              hasSession={false}
              passkeySupported
              signInWithPasskey={async () => fakeSession}
              reload={() => undefined}
            />
          </>
        )}

        {activeMode === 'pwa' && (
          <>
            <span className="client-passkey-preview-page__eyebrow">Ваш профиль</span>
            <h1>Войдите в WayYaam</h1>
            <p>Профиль остался на месте — подтвердите вход удобным способом.</p>
            <ClientPasskeyReturnPanel
              supported
              signIn={async () => fakeSession}
              onSignedIn={() => undefined}
            />
            <form className="client-passkey-preview-page__login">
              <label htmlFor="passkey-preview-phone">Телефон</label>
              <input id="passkey-preview-phone" placeholder="+7 928 000-00-00" disabled />
              <label htmlFor="passkey-preview-password">Пароль</label>
              <input id="passkey-preview-password" type="password" placeholder="Введите пароль" disabled />
              <button type="button" disabled>Войти по паролю</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
