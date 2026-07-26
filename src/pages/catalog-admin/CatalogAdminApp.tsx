import { CheckCircle2, LockKeyhole, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type UIEvent } from 'react';
import { Toaster, toast } from 'sonner';
import {
  confirmPersonalDataConsent,
  getCatalogAdminAccess,
  signInCatalogAdmin,
  signOutCatalogAdmin,
  type CatalogAdminAccess
} from '../../shared/api/catalogAdminApi';
import { redirectToClientHome } from '../../shared/appNavigation';
import { privacyPolicyIntro, privacyPolicySections, privacyPolicyTitle } from '../../shared/privacyPolicy';
import { RestaurantAdminShell } from './RestaurantAdminShell';
import './catalog-admin.css';

type CatalogAdminAppProps = {
  slug: string;
};

function CatalogLogin({
  slug,
  catalogName,
  onSuccess
}: {
  slug: string;
  catalogName: string;
  onSuccess: (access: CatalogAdminAccess) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const access = await signInCatalogAdmin(slug, email, password);
      if (!access.isMember) {
        toast.error('У этого пользователя нет доступа к каталогу');
        return;
      }
      toast.success('Вход выполнен');
      onSuccess(access);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="catalog-admin-login">
      <Toaster richColors position="top-center" />
      <form className="catalog-admin-login__card" onSubmit={onSubmit}>
        <span>
          <LockKeyhole />
        </span>
        <h1>{catalogName}</h1>
        <p>Войдите в админку своего каталога.</p>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </main>
  );
}

function CatalogForbidden({
  email,
  onSignOut
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  return (
    <main className="catalog-admin-state">
      <ShieldAlert />
      <h1>Нет доступа</h1>
      <p>
        Текущий пользователь: <strong>{email ?? 'не определён'}</strong>
      </p>
      <p>Войдите email-адресом владельца этого каталога.</p>
      <button type="button" onClick={onSignOut}>
        <LogOut />
        Выйти
      </button>
    </main>
  );
}

function CatalogDashboard({
  access,
  onRefresh,
  onSignOut,
  onConsentConfirmed
}: {
  access: CatalogAdminAccess;
  onRefresh: () => void;
  onSignOut: () => void;
  onConsentConfirmed: (access: CatalogAdminAccess) => void;
}) {
  const catalog = access.catalog;
  if (!catalog) {
    return (
      <main className="catalog-admin-state">
        <ShieldAlert />
        <h1>Каталог не найден</h1>
        <p>Проверьте ссылку на админку.</p>
      </main>
    );
  }

  const isBlockedByConsent = access.firstLogin || !access.consentGiven;

  return (
    <>
      <Toaster richColors position="top-center" />
      <RestaurantAdminShell
        access={access}
        onRefresh={onRefresh}
        onSignOut={onSignOut}
        consentModal={isBlockedByConsent ? (
          <ConsentModal
            slug={catalog.slug}
            onConfirmed={onConsentConfirmed}
          />
        ) : undefined}
      />
    </>
  );
}

function ConsentModal({
  slug,
  onConfirmed
}: {
  slug: string;
  onConfirmed: (access: CatalogAdminAccess) => void;
}) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const checkScroll = (element: HTMLDivElement) => {
    const isBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
    setScrolledToBottom(isBottom);
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (element) checkScroll(element);
  }, []);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    checkScroll(event.currentTarget);
  };

  const onConfirm = async () => {
    if (!accepted || !scrolledToBottom) return;

    setIsSubmitting(true);
    try {
      const nextAccess = await confirmPersonalDataConsent(slug);
      toast.success('Согласие подтверждено');
      onConfirmed(nextAccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось подтвердить согласие');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="consent-modal-backdrop">
      <section className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <span className="consent-modal__icon">
          <CheckCircle2 />
        </span>
        <h2 id="consent-title">Обработка персональных данных</h2>
        <p>
          Для использования системы WayCatalog необходимо подтвердить согласие на обработку персональных данных.
        </p>
        <p>Пожалуйста, ознакомьтесь с политикой ниже:</p>

        <div className="consent-modal__scroll" ref={scrollRef} onScroll={onScroll} tabIndex={0}>
          <h3>{privacyPolicyTitle}</h3>
          <p>{privacyPolicyIntro}</p>
          {privacyPolicySections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.items && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <label className="consent-modal__checkbox" aria-disabled={!scrolledToBottom}>
          <input
            type="checkbox"
            checked={accepted}
            disabled={!scrolledToBottom}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>Я ознакомился и согласен с обработкой персональных данных</span>
        </label>

        <button type="button" disabled={!accepted || !scrolledToBottom || isSubmitting} onClick={onConfirm}>
          {isSubmitting ? 'Подтверждаем...' : 'Подтвердить'}
        </button>
      </section>
    </div>
  );
}

export function CatalogAdminApp({ slug }: CatalogAdminAppProps) {
  const [access, setAccess] = useState<CatalogAdminAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setAccess(await getCatalogAdminAccess(slug));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось проверить доступ');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (isLoading) {
    return <main className="catalog-admin-state">Проверяем доступ...</main>;
  }

  if (error) {
    return (
      <main className="catalog-admin-state">
        <ShieldAlert />
        <h1>Ошибка</h1>
        <p>{error}</p>
        <button type="button" onClick={() => void refresh()}>
          <RefreshCw />
          Повторить
        </button>
      </main>
    );
  }

  if (!access?.hasSession) {
    return (
      <CatalogLogin
        slug={slug}
        catalogName={access?.catalog?.name ?? slug}
        onSuccess={(nextAccess) => setAccess(nextAccess)}
      />
    );
  }

  if (!access.isMember) {
    return (
        <CatalogForbidden
          email={access.email}
          onSignOut={() => {
            void signOutCatalogAdmin().then(() => {
              redirectToClientHome();
            });
          }}
        />
    );
  }

  return (
      <CatalogDashboard
        access={access}
        onRefresh={() => void refresh()}
        onSignOut={() => {
          void signOutCatalogAdmin().then(() => {
            redirectToClientHome();
          });
        }}
        onConsentConfirmed={(nextAccess) => setAccess(nextAccess)}
      />
  );
}
