import { Check, Copy, Fingerprint, Link2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createClientBrowserPairingCode,
  hasStoredClientSession,
  redeemClientBrowserPairingCode,
  type ClientAccountSession,
  type ClientBrowserPairingCode
} from '../../shared/api/clientAccountApi';
import {
  ClientPasskeyError,
  clientPasskeyIsSupported,
  registerClientPasskey,
  signInClientWithPasskey
} from '../../shared/api/clientPasskeyApi';
import { appIsRunningStandalone } from '../../shared/pwaSession';
import {
  formatClientPairingCode,
  isMobileBrowser,
  normalizeClientPairingCode,
  shouldShowClientBrowserPairingPrompt
} from './clientPairingPresentation';
import './client-pairing.css';

type CreateCode = () => Promise<ClientBrowserPairingCode>;
type RedeemCode = (code: string) => Promise<ClientAccountSession>;
type RegisterPasskey = () => Promise<unknown>;
type SignInWithPasskey = () => Promise<ClientAccountSession>;

const passkeyIllustration = (name: 'checkout-profile' | 'safari-profile' | 'pwa-return') =>
  `${import.meta.env.BASE_URL}assets/passkey/${name}.webp`;

const pairingDismissedKey = 'wayyaam:client-pairing-prompt-dismissed';

const readPairingDismissed = () => {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(pairingDismissedKey) === '1';
};

const formatExpiry = (expiresAt: string) => {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

export function ClientPasskeyCard({
  registerPasskey = registerClientPasskey,
  supported = clientPasskeyIsSupported()
}: {
  registerPasskey?: RegisterPasskey;
  supported?: boolean;
}) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');

  if (!supported) return null;

  const enable = async () => {
    setIsRegistering(true);
    setError('');
    try {
      await registerPasskey();
      setEnabled(true);
    } catch (cause) {
      if (cause instanceof ClientPasskeyError && cause.code === 'already_registered') {
        setEnabled(true);
      } else {
        setError(cause instanceof Error ? cause.message : 'Не удалось включить Face ID.');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <section className="client-pairing-card client-passkey-card" aria-label="Вход по Face ID">
      <span className="client-pairing-card__icon"><Fingerprint aria-hidden="true" /></span>
      <div className="client-pairing-card__copy">
        <strong>{enabled ? 'Face ID подключён' : 'Вход без пароля'}</strong>
        <p>
          {enabled
            ? 'Теперь этот профиль можно открыть через Face ID и в приложении WayYaam, и в Safari.'
            : 'Подключите Face ID один раз. После этого ссылки из WhatsApp откроются с вашим профилем.'}
        </p>
      </div>
      <button className="client-pairing-primary" type="button" onClick={() => void enable()} disabled={isRegistering || enabled}>
        {isRegistering
          ? <LoaderCircle className="is-spinning" aria-hidden="true" />
          : enabled
            ? <ShieldCheck aria-hidden="true" />
            : <Fingerprint aria-hidden="true" />}
        {isRegistering ? 'Подтвердите Face ID…' : enabled ? 'Face ID включён' : 'Включить вход по Face ID'}
      </button>
      {error && <small className="client-pairing-error" role="alert">{error}</small>}
    </section>
  );
}

export function ClientPasskeyRegistrationDialog({
  open,
  registerPasskey = registerClientPasskey,
  onContinue
}: {
  open: boolean;
  registerPasskey?: RegisterPasskey;
  onContinue: (passkeyEnabled: boolean) => void;
}) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const enableAndContinue = async () => {
    setIsRegistering(true);
    setError('');
    try {
      await registerPasskey();
      onContinue(true);
    } catch (cause) {
      if (cause instanceof ClientPasskeyError && cause.code === 'already_registered') {
        onContinue(true);
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Не удалось включить Face ID. Заказ можно оформить без него.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="client-passkey-dialog-backdrop">
      <section
        className="client-passkey-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-passkey-checkout-title"
      >
        <img
          className="client-passkey-illustration client-passkey-dialog__illustration"
          src={passkeyIllustration('checkout-profile')}
          alt="Заказ и профиль защищены входом по биометрии"
          width="640"
          height="640"
        />
        <div className="client-passkey-dialog__copy">
          <span className="client-passkey-eyebrow">Профиль готов</span>
          <h2 id="client-passkey-checkout-title">Следующий заказ — без пароля</h2>
          <p>
            Закрепите этот профиль через Face ID или отпечаток. Имя, телефон, история заказов,
            конкурсы и акции останутся в одном аккаунте — даже по ссылке из WhatsApp.
          </p>
        </div>
        <ul className="client-passkey-benefits" aria-label="Что сохранится в профиле">
          <li><Check aria-hidden="true" /> Имя и телефон</li>
          <li><Check aria-hidden="true" /> Заказы и участие в акциях</li>
          <li><ShieldCheck aria-hidden="true" /> Биометрия остаётся на устройстве</li>
        </ul>
        {error && (
          <small className="client-pairing-error" role="alert">
            {error} Корзина и заказ сохранены.
          </small>
        )}
        <button
          className="client-pairing-primary"
          type="button"
          onClick={() => void enableAndContinue()}
          disabled={isRegistering}
          autoFocus
        >
          {isRegistering ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}
          {isRegistering ? 'Подтвердите на устройстве…' : 'Включить Face ID и оформить'}
        </button>
        <button
          className="client-pairing-secondary"
          type="button"
          onClick={() => onContinue(false)}
          disabled={isRegistering}
        >
          Не сейчас, оформить заказ
        </button>
      </section>
    </div>
  );
}

export function ClientPasskeySignInButton({
  signIn = signInClientWithPasskey,
  supported = clientPasskeyIsSupported(),
  onSignedIn,
  label = 'Войти по Face ID',
  pendingLabel = 'Подтвердите Face ID…'
}: {
  signIn?: SignInWithPasskey;
  supported?: boolean;
  onSignedIn: (session: ClientAccountSession) => void;
  label?: string;
  pendingLabel?: string;
}) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');

  if (!supported) return null;

  const submit = async () => {
    setIsSigningIn(true);
    setError('');
    try {
      onSignedIn(await signIn());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти по Face ID.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="client-passkey-sign-in">
      <button className="client-pairing-primary" type="button" onClick={() => void submit()} disabled={isSigningIn}>
        {isSigningIn ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}
        {isSigningIn ? pendingLabel : label}
      </button>
      {error && <small className="client-pairing-error" role="alert">{error}</small>}
    </div>
  );
}

export function ClientPasskeyReturnPanel({
  signIn = signInClientWithPasskey,
  supported = clientPasskeyIsSupported(),
  onSignedIn
}: {
  signIn?: SignInWithPasskey;
  supported?: boolean;
  onSignedIn: (session: ClientAccountSession) => void;
}) {
  if (!supported) return null;

  return (
    <section className="client-passkey-return" aria-labelledby="client-passkey-return-title">
      <img
        className="client-passkey-illustration client-passkey-return__illustration"
        src={passkeyIllustration('pwa-return')}
        alt="Возвращение в защищённый профиль WayYaam"
        width="640"
        height="640"
      />
      <div className="client-passkey-return__copy">
        <span className="client-passkey-eyebrow">С возвращением</span>
        <h3 id="client-passkey-return-title">Продолжите в своём профиле</h3>
        <p>Подтвердите Face ID или отпечаток — пароль вводить не нужно.</p>
      </div>
      <ClientPasskeySignInButton
        signIn={signIn}
        supported={supported}
        onSignedIn={onSignedIn}
        label="Продолжить через Face ID"
        pendingLabel="Подтвердите на устройстве…"
      />
      <small className="client-passkey-return__hint">Не вы? Ниже можно войти с другим номером и паролем.</small>
    </section>
  );
}

export function ClientPwaPairingCodeCard({
  createCode = createClientBrowserPairingCode,
  copyText = (value) => navigator.clipboard.writeText(value)
}: {
  createCode?: CreateCode;
  copyText?: (value: string) => Promise<void>;
}) {
  const [pairing, setPairing] = useState<ClientBrowserPairingCode | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setIsCreating(true);
    setError('');
    setCopied(false);
    try {
      setPairing(await createCode());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать код сопряжения.');
    } finally {
      setIsCreating(false);
    }
  };

  const copy = async () => {
    if (!pairing) return;
    try {
      await copyText(formatClientPairingCode(pairing.code));
      setCopied(true);
    } catch {
      setError('Не удалось скопировать код. Нажмите и удерживайте его, чтобы скопировать вручную.');
    }
  };

  return (
    <section className="client-pairing-card" aria-label="Связать профиль с Safari">
      <span className="client-pairing-card__icon"><Link2 aria-hidden="true" /></span>
      <div className="client-pairing-card__copy">
        <strong>Заказывать по ссылкам без повторного входа</strong>
        <p>Свяжите Safari с этим профилем один раз. Пароль и вход PWA не передаются.</p>
      </div>

      {pairing ? (
        <div className="client-pairing-code" aria-live="polite">
          <small>Код для Safari</small>
          <button type="button" onClick={() => void copy()} aria-label="Скопировать код сопряжения">
            <b>{formatClientPairingCode(pairing.code)}</b>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
          <small>
            Действует 5 минут{formatExpiry(pairing.expiresAt) ? `, до ${formatExpiry(pairing.expiresAt)}` : ''}.
            Откройте ссылку ресторана в Safari, нажмите «Связать профиль» и введите код.
          </small>
        </div>
      ) : (
        <button className="client-pairing-primary" type="button" onClick={() => void generate()} disabled={isCreating}>
          {isCreating ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {isCreating ? 'Создаём код…' : 'Связать Safari без пароля'}
        </button>
      )}

      {pairing && (
        <button className="client-pairing-secondary" type="button" onClick={() => void generate()} disabled={isCreating}>
          Создать новый код
        </button>
      )}
      {error && <small className="client-pairing-error" role="alert">{error}</small>}
    </section>
  );
}

export function ClientBrowserPairingBanner({
  standalone = appIsRunningStandalone(),
  mobile = isMobileBrowser(),
  hasSession = hasStoredClientSession(),
  passkeySupported = clientPasskeyIsSupported(),
  signInWithPasskey = signInClientWithPasskey,
  redeemCode = redeemClientBrowserPairingCode,
  reload = () => window.location.reload()
}: {
  standalone?: boolean;
  mobile?: boolean;
  hasSession?: boolean;
  passkeySupported?: boolean;
  signInWithPasskey?: SignInWithPasskey;
  redeemCode?: RedeemCode;
  reload?: () => void;
}) {
  const [dismissed, setDismissed] = useState(readPairingDismissed);
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isPasskeySigningIn, setIsPasskeySigningIn] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!shouldShowClientBrowserPairingPrompt({ standalone, mobile, hasSession, dismissed })) return null;

  const dismiss = () => {
    window.sessionStorage.setItem(pairingDismissedKey, '1');
    setDismissed(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (normalizeClientPairingCode(code).length !== 12) {
      setError('Введите код из 12 символов, показанный в PWA.');
      return;
    }

    setIsRedeeming(true);
    setError('');
    setMessage('');
    try {
      const session = await redeemCode(normalizeClientPairingCode(code));
      setMessage(`Профиль ${session.name} связан. Имя и телефон будут подставлены в заказ.`);
      window.setTimeout(reload, 700);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось связать профиль.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const signIn = async () => {
    setIsPasskeySigningIn(true);
    setError('');
    setMessage('');
    try {
      const session = await signInWithPasskey();
      setMessage(`Вы вошли как ${session.name}. Имя и телефон будут подставлены в заказ.`);
      window.setTimeout(reload, 700);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось войти по Face ID.');
    } finally {
      setIsPasskeySigningIn(false);
    }
  };

  return (
    <aside className="client-browser-pairing" aria-label="Открытие WayYaam по ссылке">
      <button className="client-browser-pairing__close" type="button" onClick={dismiss} aria-label="Закрыть подсказку">
        <X aria-hidden="true" />
      </button>
      <img
        className="client-passkey-illustration client-browser-pairing__illustration"
        src={passkeyIllustration('safari-profile')}
        alt="Профиль, история заказов и участие в акциях открываются по Face ID"
        width="640"
        height="640"
      />
      <div className="client-browser-pairing__copy">
        <span className="client-passkey-eyebrow">Ссылка открылась в Safari</span>
        <strong>Откройте свой профиль WayYaam</strong>
        <p>
          Face ID вернёт имя, телефон и историю заказов. Участие в конкурсах и акциях останется
          в том же профиле.
        </p>
      </div>

      <ul className="client-passkey-benefits client-browser-pairing__benefits">
        <li><Check aria-hidden="true" /> Данные сразу подставятся в заказ</li>
        <li><Check aria-hidden="true" /> Ничего не потеряется и не создастся новый профиль</li>
      </ul>

      {passkeySupported && (
        <button className="client-pairing-primary" type="button" onClick={() => void signIn()} disabled={isPasskeySigningIn}>
          {isPasskeySigningIn ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}
          {isPasskeySigningIn ? 'Подтвердите на устройстве…' : 'Открыть мой профиль по Face ID'}
        </button>
      )}

      {isOpen ? (
        <form className="client-browser-pairing__form" onSubmit={submit}>
          <label htmlFor="client-browser-pairing-code">Код из PWA</label>
          <input
            id="client-browser-pairing-code"
            value={formatClientPairingCode(code)}
            onChange={(event) => setCode(event.target.value)}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={14}
            placeholder="A1B2-C3D4-E5F6"
            required
          />
          <button className="client-pairing-primary" type="submit" disabled={isRedeeming}>
            {isRedeeming ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}
            {isRedeeming ? 'Связываем…' : 'Подтвердить'}
          </button>
        </form>
      ) : (
        <button className="client-pairing-secondary" type="button" onClick={() => setIsOpen(true)}>
          <Link2 aria-hidden="true" />
          Другой способ входа
        </button>
      )}

      <details className="client-browser-pairing__help">
        <summary>Как открыть установленный WayYaam</summary>
        <p>Закройте браузер и нажмите значок WayYaam на экране «Домой». iPhone не позволяет сайту надёжно открыть этот значок автоматически.</p>
      </details>
      {message && <small className="client-pairing-success" role="status">{message}</small>}
      {error && <small className="client-pairing-error" role="alert">{error}</small>}
    </aside>
  );
}
