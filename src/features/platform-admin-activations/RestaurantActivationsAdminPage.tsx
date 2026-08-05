import { CheckCircle2, FileKey2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  restaurantActivationAdminApi,
  type RestaurantActivationAdminRow,
  type RestaurantActivationAdminService
} from './restaurantActivationAdminApi';
import './restaurant-activations-admin.css';

const statusLabels: Record<RestaurantActivationAdminRow['legalStatus'], string> = {
  draft: 'Черновик',
  configured: 'Настроен',
  awaiting_acceptance: 'Ожидает принятия',
  active: 'Активирован',
  suspended: 'Приостановлен',
  terminated: 'Договор прекращён',
  archived: 'Архив',
  legacy_review_required: 'Требуется проверка',
  reacceptance_required: 'Нужно повторное принятие'
};

const missingLabels: Record<string, string> = {
  restaurant_not_found: 'ресторан не найден',
  owner_account: 'не назначен владелец',
  legal_profile: 'не заполнены юридические данные и представитель',
  confirmation_destination: 'не указан телефон или email подтверждения',
  published_tariff: 'не опубликован тариф',
  published_document_bundle: 'не опубликован пакет договора',
  logo: 'не загружен логотип',
  categories: 'не добавлены категории',
  products: 'не добавлены блюда'
};

export function RestaurantActivationsAdminPage({
  service = restaurantActivationAdminApi
}: {
  service?: RestaurantActivationAdminService;
}) {
  const [rows, setRows] = useState<RestaurantActivationAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | RestaurantActivationAdminRow['legalStatus']>('all');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState<{ code: string; restaurantName: string; expiresAt: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await service.list());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить активации.');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(
    () => filter === 'all' ? rows : rows.filter((row) => row.legalStatus === filter),
    [filter, rows]
  );

  const finishSetup = async (row: RestaurantActivationAdminRow) => {
    setMessage('');
    setError('');
    try {
      const result = await service.finishSetup(row.clientId);
      if (!result.ready) {
        setMessage(`Настройка не завершена: ${result.missing.map((item) => missingLabels[item] ?? item).join('; ')}.`);
        return;
      }
      setMessage(`${row.restaurantName}: отправлен на принятие договора.`);
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось завершить настройку.');
    }
  };

  const issueCode = async (row: RestaurantActivationAdminRow) => {
    if (!row.pendingRequestId) return;
    setManualCode(null);
    setError('');
    try {
      const result = await service.issueManualCode(row.pendingRequestId);
      setManualCode({ code: result.code, restaurantName: row.restaurantName, expiresAt: result.expiresAt });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось создать код.');
    }
  };

  return (
    <main className="platform-page activation-admin-page">
      <header className="activation-admin-head">
        <div>
          <span><FileKey2 /> Юридическое подключение</span>
          <h1>Договоры и активации</h1>
          <p>Все рестораны проходят настройку и личное принятие документов. Автоматической активации нет.</p>
        </div>
        <button type="button" onClick={() => void load()}><RefreshCw /> Обновить</button>
      </header>

      <div className="activation-admin-filters" aria-label="Фильтр активаций">
        {([
          ['all', 'Все'],
          ['legacy_review_required', 'Требуется проверка'],
          ['awaiting_acceptance', 'Ожидают принятия'],
          ['active', 'Активированы'],
          ['suspended', 'Заблокированы']
        ] as const).map(([value, label]) => (
          <button type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)} key={value}>{label}</button>
        ))}
      </div>

      {loading && <div className="activation-admin-state">Загружаем рестораны...</div>}
      {error && <div className="activation-admin-message is-error" role="alert">{error}</div>}
      {message && <div className="activation-admin-message">{message}</div>}
      {manualCode && (
        <section className="activation-admin-code" role="status">
          <ShieldAlert />
          <div><small>{manualCode.restaurantName}</small><strong>{manualCode.code}</strong><span>Код показывается только сейчас. Истекает: {new Date(manualCode.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
        </section>
      )}

      {!loading && filteredRows.length === 0 && <div className="activation-admin-state">Ресторанов с таким статусом нет.</div>}
      <section className="activation-admin-list">
        {filteredRows.map((row) => (
          <article key={row.clientId}>
            <div className="activation-admin-restaurant">
              <span>{row.restaurantName.slice(0, 1).toLocaleUpperCase('ru-RU')}</span>
              <div><strong>{row.restaurantName}</strong><small>{row.ownerName || 'Владелец не указан'} · {row.phone || 'Телефон не указан'}</small></div>
            </div>
            <div className={`activation-admin-status is-${row.legalStatus}`}>
              {row.legalStatus === 'active' ? <CheckCircle2 /> : <ShieldAlert />}
              <span><strong>{statusLabels[row.legalStatus]}</strong><small>{row.bundleVersion ? `Пакет ${row.bundleVersion}` : 'Пакет не принят'}</small></span>
            </div>
            {row.missingSetup.length > 0 && (
              <ul>{row.missingSetup.map((item) => <li key={item}>{missingLabels[item] ?? item}</li>)}</ul>
            )}
            <div className="activation-admin-actions">
              {row.legalStatus !== 'active' && (
                <button type="button" onClick={() => void finishSetup(row)} aria-label={`Завершить настройку ${row.restaurantName}`}>Завершить настройку</button>
              )}
              {row.pendingRequestId && (
                <button type="button" className="is-primary" onClick={() => void issueCode(row)} aria-label={`Создать ручной код для ${row.restaurantName}`}>Создать ручной код</button>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
