import { Check, Copy, Link2, LoaderCircle, Smartphone, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createClientBrowserPairingCode,
  hasStoredClientSession,
  redeemClientBrowserPairingCode,
  type ClientAccountSession,
  type ClientBrowserPairingCode
} from '../../shared/api/clientAccountApi';
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
  redeemCode = redeemClientBrowserPairingCode,
  reload = () => window.location.reload()
}: {
  standalone?: boolean;
  mobile?: boolean;
  hasSession?: boolean;
  redeemCode?: RedeemCode;
  reload?: () => void;
}) {
  const [dismissed, setDismissed] = useState(readPairingDismissed);
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
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

  return (
    <aside className="client-browser-pairing" aria-label="Открытие WayYaam по ссылке">
      <button className="client-browser-pairing__close" type="button" onClick={dismiss} aria-label="Закрыть подсказку">
        <X aria-hidden="true" />
      </button>
      <span className="client-browser-pairing__icon"><Smartphone aria-hidden="true" /></span>
      <div className="client-browser-pairing__copy">
        <strong>Заказываете по ссылке из WhatsApp?</strong>
        <p>
          На iPhone ссылка открывается в браузере. Свяжите профиль один раз — имя и телефон будут
          подставляться без пароля. Для конкурсов и акций открывайте WayYaam с экрана «Домой».
        </p>
      </div>

      {!isOpen ? (
        <button className="client-pairing-primary" type="button" onClick={() => setIsOpen(true)}>
          <Link2 aria-hidden="true" />
          Связать профиль
        </button>
      ) : (
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
