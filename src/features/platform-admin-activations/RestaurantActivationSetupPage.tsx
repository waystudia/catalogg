import { ArrowLeft, FileCheck2, Save, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  RestaurantActivationAdminService,
  RestaurantActivationAdminSetup,
  RestaurantActivationAdminSetupInput,
  RestaurantActivationAdminTariff
} from './restaurantActivationAdminApi';

const emptyTariff = (): RestaurantActivationAdminTariff => ({
  name: 'Базовый',
  restaurantCommissionAmount: 30,
  driverCommissionAmount: 30,
  version: '',
  startsAt: '',
  freePeriodTerms: '',
  commissionRules: '30 ₽ за принятый заказ и 30 ₽ за доставку согласно типу курьера',
  individualTerms: ''
});

const toInput = (setup: RestaurantActivationAdminSetup): RestaurantActivationAdminSetupInput => ({
  logoUrl: setup.logoUrl,
  profile: setup.profile,
  tariff: setup.tariff ?? emptyTariff()
});

const missingLabels: Record<string, string> = {
  owner_account: 'назначить владельца ресторана',
  legal_profile: 'заполнить юридическое наименование, представителя и основание полномочий',
  confirmation_destination: 'указать телефон или email для подтверждения',
  published_tariff: 'заполнить и сохранить тариф',
  published_document_bundle: 'опубликовать пакет оферты',
  logo: 'добавить логотип',
  categories: 'добавить категории меню',
  products: 'добавить блюда'
};

export function RestaurantActivationSetupPage({
  clientId,
  service,
  onBack
}: {
  clientId: string;
  service: RestaurantActivationAdminService;
  onBack: () => void;
}) {
  const [setup, setSetup] = useState<RestaurantActivationAdminSetup | null>(null);
  const [draft, setDraft] = useState<RestaurantActivationAdminSetupInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void service.loadSetup(clientId).then(
      (nextSetup) => {
        if (!active) return;
        setSetup(nextSetup);
        setDraft(toInput(nextSetup));
        setLoading(false);
      },
      (nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить настройку ресторана.');
        setLoading(false);
      }
    );
    return () => {
      active = false;
    };
  }, [clientId, service]);

  const updateProfile = (field: keyof RestaurantActivationAdminSetupInput['profile'], value: string) => {
    setDraft((current) => current ? { ...current, profile: { ...current.profile, [field]: value } } : current);
  };

  const updateTariff = (field: keyof RestaurantActivationAdminTariff, value: string | number) => {
    setDraft((current) => current ? { ...current, tariff: { ...current.tariff, [field]: value } } : current);
  };

  const save = async (sendToOwner: boolean) => {
    if (!draft) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const nextSetup = await service.saveSetup(clientId, draft);
      setSetup(nextSetup);
      setDraft(toInput(nextSetup));
      if (!sendToOwner) {
        setMessage('Данные ресторана сохранены. Владелец увидит их перед принятием оферты.');
        return;
      }
      const result = await service.finishSetup(clientId);
      if (!result.ready) {
        setMessage(`Данные сохранены. Перед отправкой владельцу осталось: ${result.missing.map((item) => missingLabels[item] ?? item).join('; ')}.`);
        return;
      }
      setMessage('Настройка завершена. Владелец может открыть оферту и подтвердить активацию.');
      setSetup({ ...nextSetup, legalStatus: 'awaiting_acceptance', missingSetup: [] });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось сохранить настройку ресторана.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="platform-page activation-admin-state">Загружаем карточку ресторана...</main>;
  if (!setup || !draft) {
    return <main className="platform-page activation-admin-page"><button type="button" onClick={onBack}>Назад</button><div className="activation-admin-message is-error">{error || 'Карточка ресторана не найдена.'}</div></main>;
  }

  return (
    <main className="platform-page activation-admin-page activation-setup-page">
      <header className="activation-setup-head">
        <button type="button" onClick={onBack}><ArrowLeft /> К списку</button>
        <div>
          <span><ShieldCheck /> Индивидуальная настройка</span>
          <h1>Настройка активации: {setup.restaurantName}</h1>
          <p>Эти реквизиты и тариф увидит владелец перед принятием оферты. После подтверждения они сохранятся в юридическом снимке акцепта.</p>
        </div>
      </header>

      {message && <div className="activation-admin-message" role="status">{message}</div>}
      {error && <div className="activation-admin-message is-error" role="alert">{error}</div>}

      <form className="activation-setup-form" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <section className="activation-setup-card">
          <div className="activation-setup-card__head"><strong>Ресторан и реквизиты</strong><span>Индивидуально для {setup.restaurantName}</span></div>
          <div className="activation-setup-grid">
            <label className="is-wide">Логотип (URL)<input value={draft.logoUrl} onChange={(event) => setDraft({ ...draft, logoUrl: event.target.value })} /></label>
            <label>Форма организации<input value={draft.profile.organizationType} onChange={(event) => updateProfile('organizationType', event.target.value)} placeholder="ИП или ООО" /></label>
            <label>Юридическое наименование<input value={draft.profile.legalName} onChange={(event) => updateProfile('legalName', event.target.value)} /></label>
            <label>ИНН<input inputMode="numeric" value={draft.profile.inn} onChange={(event) => updateProfile('inn', event.target.value)} /></label>
            <label>ОГРН / ОГРНИП<input inputMode="numeric" value={draft.profile.ogrn} onChange={(event) => updateProfile('ogrn', event.target.value)} /></label>
            <label className="is-wide">Юридический адрес<input value={draft.profile.legalAddress} onChange={(event) => updateProfile('legalAddress', event.target.value)} /></label>
            <label className="is-wide">Фактический адрес<input value={draft.profile.actualAddress} onChange={(event) => updateProfile('actualAddress', event.target.value)} /></label>
            <label>Телефон ресторана<input type="tel" value={draft.profile.restaurantPhone} onChange={(event) => updateProfile('restaurantPhone', event.target.value)} /></label>
            <label>Email ресторана<input type="email" value={draft.profile.restaurantEmail} onChange={(event) => updateProfile('restaurantEmail', event.target.value)} /></label>
            <label>ФИО руководителя<input value={draft.profile.directorFullName} onChange={(event) => updateProfile('directorFullName', event.target.value)} /></label>
            <label>ФИО представителя<input value={draft.profile.representativeFullName} onChange={(event) => updateProfile('representativeFullName', event.target.value)} /></label>
            <label className="is-wide">Основание полномочий<input value={draft.profile.authorityBasis} onChange={(event) => updateProfile('authorityBasis', event.target.value)} placeholder="Устав, доверенность или свидетельство ИП" /></label>
            <label>Телефон подтверждения<input type="tel" value={draft.profile.primaryConfirmationPhone} onChange={(event) => updateProfile('primaryConfirmationPhone', event.target.value)} /></label>
            <label>Email подтверждения<input type="email" value={draft.profile.primaryConfirmationEmail} onChange={(event) => updateProfile('primaryConfirmationEmail', event.target.value)} /></label>
            <label className="is-wide">Модель доставки<input value={draft.profile.deliveryModel} onChange={(event) => updateProfile('deliveryModel', event.target.value)} /></label>
          </div>
        </section>

        <section className="activation-setup-card">
          <div className="activation-setup-card__head"><strong>Индивидуальный тариф</strong><span>Публикуется для этого ресторана</span></div>
          <div className="activation-setup-grid">
            <label>Название тарифа<input value={draft.tariff.name} onChange={(event) => updateTariff('name', event.target.value)} /></label>
            <label>Версия тарифа<input value={draft.tariff.version} onChange={(event) => updateTariff('version', event.target.value)} placeholder="Например, 2.0-rizih" /></label>
            <label>Комиссия ресторана, ₽<input type="number" min="0" step="0.01" value={draft.tariff.restaurantCommissionAmount} onChange={(event) => updateTariff('restaurantCommissionAmount', Number(event.target.value))} /></label>
            <label>Комиссия за доставку, ₽<input type="number" min="0" step="0.01" value={draft.tariff.driverCommissionAmount} onChange={(event) => updateTariff('driverCommissionAmount', Number(event.target.value))} /></label>
            <label>Начало действия<input type="date" value={draft.tariff.startsAt.slice(0, 10)} onChange={(event) => updateTariff('startsAt', event.target.value ? `${event.target.value}T00:00:00.000Z` : '')} /></label>
            <label className="is-wide">Правила комиссии<textarea value={draft.tariff.commissionRules} onChange={(event) => updateTariff('commissionRules', event.target.value)} /></label>
            <label className="is-wide">Условия бесплатного периода<textarea value={draft.tariff.freePeriodTerms} onChange={(event) => updateTariff('freePeriodTerms', event.target.value)} /></label>
            <label className="is-wide">Индивидуальные условия<textarea value={draft.tariff.individualTerms} onChange={(event) => updateTariff('individualTerms', event.target.value)} /></label>
          </div>
        </section>

        <section className={`activation-setup-bundle ${setup.bundle ? 'is-ready' : ''}`}>
          <FileCheck2 />
          <div>
            <strong>Пакет оферты</strong>
            <span>{setup.bundle ? `${setup.bundle.title} · версия ${setup.bundle.version}` : 'Опубликованный пакет оферты пока отсутствует'}</span>
          </div>
        </section>

        {setup.missingSetup.length > 0 && (
          <section className="activation-setup-missing">
            <strong>До отправки владельцу осталось:</strong>
            <ul>{setup.missingSetup.map((item) => <li key={item}>{missingLabels[item] ?? item}</li>)}</ul>
          </section>
        )}

        <div className="activation-setup-actions">
          <button type="submit" disabled={saving}><Save /> {saving ? 'Сохраняем...' : 'Сохранить данные'}</button>
          <button type="button" className="is-primary" disabled={saving} onClick={() => void save(true)}><Send /> Сохранить и отправить владельцу</button>
        </div>
      </form>
    </main>
  );
}
