import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BrandLogo } from '../../shared/BrandLogo';
import {
  REQUIRED_ACTIVATION_CONFIRMATIONS,
  createEmptyActivationConfirmations,
  getMissingActivationConfirmations,
  getRestaurantActivationProgress,
  type ActivationConfirmations
} from './restaurantActivation';
import {
  restaurantActivationApi,
  type RestaurantActivationDocument,
  type RestaurantActivationService,
  type RestaurantActivationView
} from './restaurantActivationApi';
import './restaurant-activation.css';

const valueOrDash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? 'Не указано' : String(value);

const activationErrorMessages: Record<string, string> = {
  access_denied: 'Войдите под аккаунтом владельца этого ресторана, чтобы продолжить активацию.',
  invalid_code: 'Код неверный. Проверьте цифры и попробуйте ещё раз.',
  code_locked: 'Превышено число попыток. Ввод временно заблокирован.',
  code_expired: 'Срок действия кода истёк. Запросите новый код через супер-администратора.',
  code_not_issued: 'Супер-администратор ещё не создал ручной код.',
  stale_document_bundle: 'Редакция документов изменилась. Откройте актуальный пакет и подтвердите его заново.'
};

export function RestaurantActivationPage({
  service = restaurantActivationApi
}: {
  service?: RestaurantActivationService;
}) {
  const [view, setView] = useState<RestaurantActivationView | null>(null);
  const [confirmations, setConfirmations] = useState<ActivationConfirmations>(createEmptyActivationConfirmations);
  const [marketingConsents, setMarketingConsents] = useState({ advertising: false, promotions: false });
  const [openedDocumentIds, setOpenedDocumentIds] = useState<string[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<RestaurantActivationDocument | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestIdempotencyKey] = useState(() => crypto.randomUUID());
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    let active = true;
    void service.loadCurrent().then(
      (nextView) => {
        if (!active) return;
        setView(nextView);
        setOpenedDocumentIds(nextView.documents.filter((document) => document.opened).map((document) => document.id));
        setRequestId(nextView.pendingRequestId);
        setActivated(nextView.legalStatus === 'active');
        setLoading(false);
      },
      (nextError: unknown) => {
        if (!active) return;
        const errorCode = nextError instanceof Error ? nextError.message : '';
        setError(activationErrorMessages[errorCode] ?? (errorCode || 'Не удалось загрузить активацию.'));
        setLoading(false);
      }
    );
    return () => {
      active = false;
    };
  }, [service]);

  const confirmationsComplete = getMissingActivationConfirmations(confirmations).length === 0;
  const progress = getRestaurantActivationProgress({
    documentsOpened: openedDocumentIds.length,
    documentCount: view?.documents.length ?? 0,
    confirmationsComplete,
    codeRequested: requestId !== null,
    active: activated
  });
  const canRequestCode = Boolean(
    view?.bundleId &&
    view.legalStatus === 'awaiting_acceptance' &&
    view.canAcceptLegalDocuments &&
    confirmationsComplete &&
    !requestId &&
    !activated
  );

  const details = useMemo(() => view ? [
    ['Ресторан', view.restaurant.name],
    ['Форма организации', view.restaurant.organizationType],
    ['Юридическое наименование', view.restaurant.legalName],
    ['ИНН', view.restaurant.inn],
    ['ОГРН / ОГРНИП', view.restaurant.ogrn],
    ['Юридический адрес', view.restaurant.legalAddress],
    ['Фактический адрес', view.restaurant.actualAddress],
    ['Руководитель', view.restaurant.directorFullName],
    ['Представитель', view.restaurant.representativeFullName],
    ['Основание полномочий', view.restaurant.authorityBasis],
    ['Телефон', view.restaurant.phone],
    ['Email', view.restaurant.email],
    ['Модель доставки', view.restaurant.deliveryModel]
  ] : [], [view]);

  const openDocument = async (document: RestaurantActivationDocument) => {
    setSelectedDocument(document);
    if (openedDocumentIds.includes(document.id)) return;
    setError('');
    try {
      await service.markDocumentOpened(document.id);
      setOpenedDocumentIds((current) => [...current, document.id]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось зафиксировать открытие документа.');
    }
  };

  const requestCode = async () => {
    if (!view?.bundleId || !canRequestCode) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await service.requestCode({
        bundleId: view.bundleId,
        idempotencyKey: requestIdempotencyKey,
        confirmations,
        openedDocumentIds,
        marketingConsents
      });
      setRequestId(result.requestId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось запросить код.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmActivation = async () => {
    if (!requestId || !/^\d{6}$/.test(code)) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await service.confirmActivation(requestId, code);
      if (!result.ok) {
        setError(activationErrorMessages[result.error ?? ''] ?? 'Подтверждение не выполнено.');
        return;
      }
      setActivated(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось активировать ресторан.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="restaurant-activation-state">Загружаем данные активации...</main>;
  }

  if (!view) {
    return (
      <main className="restaurant-activation-state">
        <h1>Активация недоступна</h1>
        <p>{error || 'Ресторан не найден.'}</p>
      </main>
    );
  }

  return (
    <main className="restaurant-activation-page">
      <header className="restaurant-activation-header">
        <BrandLogo />
        <div className="restaurant-activation-header__actions">
          <a aria-label="Вернуться в кабинет" href={`#/${view.catalogSlug}/dashboard`}><ArrowLeft /><span>В кабинет</span></a>
          <button type="button" onClick={() => void service.signOut()}><LogOut /> Выйти</button>
        </div>
      </header>

      <section className="restaurant-activation-hero">
        <span className="restaurant-activation-kicker"><ShieldCheck /> Юридическое подключение</span>
        <h1>Активация ресторана в WayYaam</h1>
        <p>Проверьте данные ресторана, ознакомьтесь с условиями подключения и подтвердите активацию.</p>
        <div className="restaurant-activation-progress" aria-label={`Этап ${progress} из 5`}>
          <strong>{progress} из 5</strong>
          <span>{['Проверка данных', 'Документы', 'Полномочия', 'Код', 'Активация'][progress - 1]}</span>
          <div>{Array.from({ length: 5 }, (_, index) => <i className={index < progress ? 'is-complete' : ''} key={index} />)}</div>
        </div>
      </section>

      {activated ? (
        <section className="restaurant-activation-success">
          <span><Check /></span>
          <h2>Ресторан активирован</h2>
          <p>Договор зафиксирован. Рабочие функции и приём реальных заказов теперь доступны.</p>
          <a href={`#/${view.catalogSlug}/dashboard`}>Перейти в кабинет <ChevronRight /></a>
        </section>
      ) : (
        <div className="restaurant-activation-layout">
          {view.legalStatus !== 'awaiting_acceptance' && (
            <div className="restaurant-activation-notice">Супер-администратор ещё настраивает реквизиты, тариф или пакет оферты. Вы можете проверить данные, но запрос кода откроется после завершения настройки.</div>
          )}
          <section className="restaurant-activation-card">
            <div className="restaurant-activation-card__head">
              <span>1</span><div><h2>Проверьте данные</h2><p>Реквизиты и индивидуальный тариф настроены для вашего ресторана и останутся в снимке акцепта.</p></div>
            </div>
            <dl className="restaurant-activation-details">
              {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{valueOrDash(value)}</dd></div>)}
            </dl>
            {view.tariff && (
              <div className="restaurant-activation-tariff">
                <strong>{view.tariff.name} · версия {view.tariff.version}</strong>
                <span>{view.tariff.restaurantCommissionAmount} ₽ с заказа · {view.tariff.driverCommissionAmount} ₽ с доставки</span>
                {(view.tariff.commissionRules || view.tariff.freePeriodTerms || view.tariff.individualTerms) && (
                  <ul>
                    {view.tariff.commissionRules && <li>{view.tariff.commissionRules}</li>}
                    {view.tariff.freePeriodTerms && <li>{view.tariff.freePeriodTerms}</li>}
                    {view.tariff.individualTerms && <li>{view.tariff.individualTerms}</li>}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="restaurant-activation-card">
            <div className="restaurant-activation-card__head">
              <span>2</span><div><h2>Откройте документы</h2><p>Фиксируется версия и факт открытия, а не прокрутка страницы.</p></div>
            </div>
            {!view.bundleId ? (
              <div className="restaurant-activation-notice">Пакет договора ещё не опубликован. Активация станет доступна после настройки договора супер-администратором.</div>
            ) : (
              <div className="restaurant-activation-documents">
                {view.documents.map((document) => {
                  const opened = openedDocumentIds.includes(document.id);
                  return (
                    <article key={document.id}>
                      <FileCheck2 />
                      <div><strong>{document.title}</strong><small>Версия {document.version} · SHA-256 сохранён</small></div>
                      {opened && <em>Открыт</em>}
                      <button type="button" aria-label={`Открыть ${document.title}`} onClick={() => void openDocument(document)}><ExternalLink /></button>
                      {document.pdfUrl && <a href={document.pdfUrl} download aria-label={`Скачать ${document.title}`}><Download /></a>}
                    </article>
                  );
                })}
              </div>
            )}
            {selectedDocument && (
              <div className="restaurant-activation-viewer">
                <header><strong>{selectedDocument.title}</strong><button type="button" onClick={() => setSelectedDocument(null)}>Закрыть</button></header>
                {selectedDocument.pdfUrl ? (
                  <iframe title={selectedDocument.title} src={selectedDocument.pdfUrl} />
                ) : (
                  <p>PDF этой редакции пока не загружен.</p>
                )}
              </div>
            )}
          </section>

          <section className="restaurant-activation-card">
            <div className="restaurant-activation-card__head">
              <span>3</span><div><h2>Подтвердите условия и полномочия</h2><p>Каждое обязательное подтверждение оформляется отдельно.</p></div>
            </div>
            {!view.canAcceptLegalDocuments && (
              <div className="restaurant-activation-notice is-danger">У вашей роли нет права принимать юридические документы. Обратитесь к владельцу или супер-администратору.</div>
            )}
            <div className="restaurant-activation-checks">
              {REQUIRED_ACTIVATION_CONFIRMATIONS.map(({ key, label }) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={confirmations[key]}
                    disabled={!view.canAcceptLegalDocuments || !view.bundleId}
                    onChange={(event) => setConfirmations((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <h3>Необязательные согласия</h3>
            <div className="restaurant-activation-checks is-optional">
              <label><input type="checkbox" checked={marketingConsents.advertising} onChange={(event) => setMarketingConsents((current) => ({ ...current, advertising: event.target.checked }))} /><span>Согласен получать рекламные сообщения.</span></label>
              <label><input type="checkbox" checked={marketingConsents.promotions} onChange={(event) => setMarketingConsents((current) => ({ ...current, promotions: event.target.checked }))} /><span>Согласен участвовать в акциях и маркетинговых рассылках.</span></label>
            </div>
            {view.canAcceptLegalDocuments && (
              <button className="restaurant-activation-primary" type="button" disabled={!canRequestCode || submitting} onClick={() => void requestCode()}>
                {submitting ? 'Отправляем запрос...' : 'Запросить код подтверждения'}
              </button>
            )}
          </section>

          {requestId && (
            <section className="restaurant-activation-card">
              <div className="restaurant-activation-card__head">
                <span>4</span><div><h2>Введите код</h2><p>Получите ручной одноразовый код у супер-администратора. Код действует 10 минут.</p></div>
              </div>
              <label className="restaurant-activation-code">
                <span>Шестизначный код</span>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
              </label>
              <button className="restaurant-activation-primary" type="button" disabled={!/^\d{6}$/.test(code) || submitting} onClick={() => void confirmActivation()}>
                {submitting ? 'Проверяем...' : 'Активировать ресторан'}
              </button>
            </section>
          )}

          {error && <div className="restaurant-activation-error" role="alert">{error}</div>}
        </div>
      )}
    </main>
  );
}
