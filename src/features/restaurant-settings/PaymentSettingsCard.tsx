import { QrCode } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { imageFileToDataUrl } from '../../shared/images';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';

export function PaymentSettingsCard({ slug, settings, businessType = 'restaurant', onSave }: { slug: string; settings: RestaurantPaymentSettings; businessType?: string; onSave: (settings: RestaurantPaymentSettings) => void }) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const setField = <K extends keyof RestaurantPaymentSettings>(key: K, value: RestaurantPaymentSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const uploadQr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setField('qrUrl', await imageFileToDataUrl(file));
    } catch {
      toast.error('Не удалось загрузить QR-код');
    }
  };

  return (
    <main className="settings-screen payment-settings-screen">
      <section className="settings-form-card payment-settings-card">
        <h2>Реквизиты для перевода</h2>
        <label className="settings-toggle-row">
          <input type="checkbox" checked={draft.transferEnabled} onChange={(event) => setField('transferEnabled', event.target.checked)} />
          Включить оплату переводом
        </label>
        <label>
          Тип реквизита
          <select value={draft.requisiteType} onChange={(event) => setField('requisiteType', event.target.value as RestaurantPaymentSettings['requisiteType'])}>
            <option value="phone">Телефон</option>
            <option value="card">Карта</option>
            <option value="account">Счет</option>
          </select>
        </label>
        <label>
          Номер для перевода
          <input value={draft.transferNumber} onChange={(event) => setField('transferNumber', event.target.value)} />
        </label>
        <label>
          Банк
          <input value={draft.bankName} onChange={(event) => setField('bankName', event.target.value)} placeholder="Сбер, Тинькофф..." />
        </label>
        <div className="settings-form-grid">
          <label>
            Фамилия
            <input value={draft.lastName} onChange={(event) => setField('lastName', event.target.value)} />
          </label>
          <label>
            Имя
            <input value={draft.firstName} onChange={(event) => setField('firstName', event.target.value)} />
          </label>
          <label>
            Отчество
            <input value={draft.middleName} onChange={(event) => setField('middleName', event.target.value)} />
          </label>
        </div>
        <label>
          Отображаемое имя
          <input value={draft.displayName} onChange={(event) => setField('displayName', event.target.value)} placeholder="ФИО, которое увидит клиент" />
        </label>
        <label>
          Комментарий к оплате
          <textarea value={draft.comment} onChange={(event) => setField('comment', event.target.value)} />
        </label>
        <label className="settings-toggle-row">
          <input type="checkbox" checked={draft.allowCash} onChange={(event) => setField('allowCash', event.target.checked)} />
          Разрешить наличные
        </label>
        <label className="settings-toggle-row">
          <input type="checkbox" checked={draft.requireConfirmation} onChange={(event) => setField('requireConfirmation', event.target.checked)} />
          Требовать подтверждение {businessType === 'grocery' ? 'магазином' : 'рестораном'}
        </label>
        <label className="payment-qr-upload">
          <QrCode />
          {draft.qrUrl ? 'Заменить QR-код' : 'Загрузить QR-код'}
          <input type="file" accept="image/*" onChange={uploadQr} />
        </label>
        <div className="payment-client-preview">
          <h3>Как увидит клиент</h3>
          <strong>{draft.displayName || [draft.lastName, draft.firstName, draft.middleName].filter(Boolean).join(' ') || 'Получатель не указан'}</strong>
          <span>
            {draft.bankName || 'Банк не указан'} · {draft.transferNumber || 'Номер не указан'}
          </span>
          {draft.qrUrl ? <img src={draft.qrUrl} alt="QR-код для перевода" /> : <QrCode />}
          <small>{draft.comment}</small>
        </div>
        <button
          className="primary-wide"
          type="button"
          onClick={() => {
            onSave(draft);
            toast.success(`Платежи сохранены для ${slug}`);
          }}
        >
          Сохранить платежи
        </button>
      </section>
    </main>
  );
}
