import { CheckCircle2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import {
  confirmPersonalDataConsent,
  getCatalogAdminAccess,
  signOutCatalogAdmin,
  type CatalogAdminAccess
} from '../../shared/api/catalogAdminApi';
import { redirectToClientHome } from '../../shared/appNavigation';
import { confirmRoleSignOut } from '../../shared/roleSessionSafety';
import { legalDocumentReleases, legalDocuments } from '../../shared/legalDocuments';
import { RestaurantAdminShell } from './RestaurantAdminShell';
import './catalog-admin.css';

type CatalogAdminAppProps = {
  slug: string;
};

function CatalogLogin() {
  return <Navigate to="/login" replace />;
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
  const [acceptedOffer, setAcceptedOffer] = useState(false);
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
    if (!accepted || !acceptedOffer || !scrolledToBottom) return;

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
          Для использования WayYaam представитель заведения отдельно принимает оферту и согласие на обработку данных.
        </p>
        <p>Пожалуйста, ознакомьтесь с политикой ниже:</p>

        <div className="consent-modal__scroll" ref={scrollRef} onScroll={onScroll} tabIndex={0}>
          <h3>Документы для заведения</h3>
          <p>Оферта определяет условия кабинета, заказов, контента, расчётов, защиты клиентских данных и удаления ресторана.</p>
          <p>Отдельное согласие представителя охватывает его ФИО, телефон, email, полномочия, договорные и платёжные сведения.</p>
          <p><a href={legalDocuments.restaurantOffer} target="_blank" rel="noreferrer">Открыть оферту для ресторанов</a></p>
          <p><a href={legalDocuments.restaurantConsent} target="_blank" rel="noreferrer">Открыть согласие представителя ресторана</a></p>
          <p><a href={legalDocuments.policy} target="_blank" rel="noreferrer">Открыть политику обработки персональных данных</a></p>
          <p>Прокрутите этот блок до конца, затем подтвердите документы раздельно. Оферта для ресторанов представлена в редакции {legalDocumentReleases.restaurant_offer.version} от 6 августа 2026 года.</p>
        </div>

        <label className="consent-modal__checkbox" aria-disabled={!scrolledToBottom}>
          <input
            type="checkbox"
            checked={accepted}
            disabled={!scrolledToBottom}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>Даю отдельное согласие представителя ресторана на обработку персональных данных</span>
        </label>

        <label className="consent-modal__checkbox" aria-disabled={!scrolledToBottom}>
          <input
            type="checkbox"
            checked={acceptedOffer}
            disabled={!scrolledToBottom}
            onChange={(event) => setAcceptedOffer(event.target.checked)}
          />
          <span>Принимаю оферту для ресторанов и подтверждаю права на загружаемые материалы</span>
        </label>

        <button type="button" disabled={!accepted || !acceptedOffer || !scrolledToBottom || isSubmitting} onClick={onConfirm}>
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
      <CatalogLogin />
    );
  }

  if (!access.isMember) {
    return (
        <CatalogForbidden
          email={access.email}
          onSignOut={() => {
            if (!confirmRoleSignOut('заведения')) return;
            void signOutCatalogAdmin().then(() => {
              redirectToClientHome();
            });
          }}
        />
    );
  }

  if (access.legalActivationStatus !== 'active') {
    return <Navigate replace to="/restaurant/activation" />;
  }

  return (
      <CatalogDashboard
        access={access}
        onRefresh={() => void refresh()}
        onSignOut={() => {
          if (!confirmRoleSignOut('заведения')) return;
          void signOutCatalogAdmin().then(() => {
            redirectToClientHome();
          });
        }}
        onConsentConfirmed={(nextAccess) => setAccess(nextAccess)}
      />
  );
}
