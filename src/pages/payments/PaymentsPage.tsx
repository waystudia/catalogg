import {
  Banknote,
  Building2,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  Phone,
  QrCode,
  Trash2,
  Upload,
  User
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Toaster, toast } from 'sonner';
import {
  getPaymentCatalogs,
  getRestaurantPayments,
  saveRestaurantPayments,
  type PaymentCatalogOption
} from '../../shared/api/restaurantPaymentsApi';
import { imageFileToDataUrl } from '../../shared/images';
import { defaultPaymentSettings, type RestaurantPaymentSettings } from '../../shared/paymentSettings';
import './payments.css';

const banks = ['Сбербанк', 'Тинькофф', 'Альфа-Банк', 'ВТБ', 'Газпромбанк'];

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^8/, '7').replace(/^7?/, '7').slice(0, 11);
  const parts = {
    code: digits.slice(1, 4),
    first: digits.slice(4, 7),
    second: digits.slice(7, 9),
    third: digits.slice(9, 11)
  };
  let result = '+7';
  if (parts.code) result += ` (${parts.code}`;
  if (parts.code.length === 3) result += ')';
  if (parts.first) result += ` ${parts.first}`;
  if (parts.second) result += `-${parts.second}`;
  if (parts.third) result += `-${parts.third}`;
  return result;
}

function validateQrFile(file: File) {
  const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
  if (!allowed.includes(file.type)) return 'Можно загрузить PNG, JPG или SVG.';
  if (file.size > 5 * 1024 * 1024) return 'Файл должен быть до 5MB.';
  return '';
}

export function PaymentsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [catalogs, setCatalogs] = useState<PaymentCatalogOption[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [settings, setSettings] = useState<RestaurantPaymentSettings>(defaultPaymentSettings);
  const [previewTab, setPreviewTab] = useState<'phone' | 'qr'>('phone');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCatalog = catalogs.find((catalog) => catalog.id === selectedCatalogId);
  const disabled = !settings.transferEnabled;
  const recipientName = settings.displayName || [settings.lastName, settings.firstName, settings.middleName].filter(Boolean).join(' ');

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const nextCatalogs = await getPaymentCatalogs();
        if (disposed) return;
        setCatalogs(nextCatalogs);
        setSelectedCatalogId((current) => current || nextCatalogs[0]?.id || '');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Не удалось загрузить рестораны');
      } finally {
        if (!disposed) setIsLoading(false);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCatalog) return;
    let disposed = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const nextSettings = await getRestaurantPayments(selectedCatalog.id, selectedCatalog.slug);
        if (!disposed) setSettings(nextSettings);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Не удалось загрузить платежи');
      } finally {
        if (!disposed) setIsLoading(false);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [selectedCatalog]);

  const setField = <K extends keyof RestaurantPaymentSettings>(key: K, value: RestaurantPaymentSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const setNameField = (key: 'lastName' | 'firstName' | 'middleName', value: string) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      const autoName = [next.lastName, next.firstName, next.middleName].filter(Boolean).join(' ');
      return {
        ...next,
        displayName: current.displayName === [current.lastName, current.firstName, current.middleName].filter(Boolean).join(' ')
          ? autoName
          : next.displayName
      };
    });
  };

  const uploadFile = async (file?: File) => {
    if (!file) return;
    const error = validateQrFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    try {
      setField('qrUrl', await imageFileToDataUrl(file));
      toast.success('QR загружен');
    } catch {
      toast.error('Не удалось загрузить QR');
    }
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void uploadFile(event.dataTransfer.files[0]);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadFile(event.target.files?.[0]);
  };

  const save = async () => {
    if (!selectedCatalog) return;
    setIsSaving(true);
    try {
      await saveRestaurantPayments(selectedCatalog.id, selectedCatalog.slug, settings);
      toast.success('Сохранено');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      setIsSaving(false);
    }
  };

  const requisiteIcon = useMemo(() => {
    if (settings.requisiteType === 'card') return <CreditCard />;
    if (settings.requisiteType === 'account') return <Building2 />;
    return <Phone />;
  }, [settings.requisiteType]);

  return (
    <main className="payments-page">
      <Toaster richColors position="top-center" />
      <header className="payments-head">
        <div>
          <h1>Платежи</h1>
          <p>Настройка способов оплаты и реквизитов для переводов</p>
        </div>
        {catalogs.length > 1 && (
          <label>
            Ресторан
            <select value={selectedCatalogId} onChange={(event) => setSelectedCatalogId(event.target.value)}>
              {catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}
            </select>
          </label>
        )}
      </header>

      <section className="payments-layout" aria-busy={isLoading}>
        <div className="payments-form-stack">
          <section className="payments-card">
            <h2><span>Р</span>Реквизиты для перевода</h2>
            <label className="payments-toggle">
              <input
                type="checkbox"
                checked={settings.transferEnabled}
                onChange={(event) => setField('transferEnabled', event.target.checked)}
              />
              <span>
                <strong>Включить оплату переводом</strong>
                <small>Клиенты смогут оплачивать заказы переводом на указанные реквизиты</small>
              </span>
            </label>

            <fieldset disabled={disabled}>
              <label>
                Тип реквизита
                <span className="payments-input-icon">
                  {requisiteIcon}
                  <select value={settings.requisiteType} onChange={(event) => setField('requisiteType', event.target.value as RestaurantPaymentSettings['requisiteType'])}>
                    <option value="phone">Телефон</option>
                    <option value="card">Карта</option>
                    <option value="account">Счет</option>
                  </select>
                  <ChevronDown />
                </span>
              </label>
              <label>
                Номер для перевода
                <span className="payments-input-icon">
                  <Phone />
                  <input
                    value={settings.transferNumber}
                    onChange={(event) => setField('transferNumber', settings.requisiteType === 'phone' ? maskPhone(event.target.value) : event.target.value)}
                    placeholder="+7 (___) ___-__-__"
                  />
                </span>
              </label>
              <label>
                Банк
                <span className="payments-input-icon">
                  <Building2 />
                  <input list="payment-banks" value={settings.bankName} onChange={(event) => setField('bankName', event.target.value)} placeholder="Сбер, Тинькофф, Альфа-Банк..." />
                </span>
              </label>
              <datalist id="payment-banks">
                {banks.map((bank) => <option key={bank} value={bank} />)}
              </datalist>
              <div className="payments-name-grid">
                <label>Фамилия<input value={settings.lastName} onChange={(event) => setNameField('lastName', event.target.value)} /></label>
                <label>Имя<input value={settings.firstName} onChange={(event) => setNameField('firstName', event.target.value)} /></label>
                <label>Отчество<input value={settings.middleName} onChange={(event) => setNameField('middleName', event.target.value)} /></label>
              </div>
              <label>
                Отображаемое имя
                <input value={settings.displayName} onChange={(event) => setField('displayName', event.target.value)} placeholder="ФИО, которое увидит клиент при оплате" />
              </label>
              <label>
                Комментарий к оплате
                <textarea value={settings.comment} onChange={(event) => setField('comment', event.target.value)} />
              </label>
              <label className="payments-option">
                <Banknote />
                <span><strong>Разрешить наличные</strong><small>Клиенты смогут оплачивать наличными курьеру</small></span>
                <input type="checkbox" checked={settings.allowCash} onChange={(event) => setField('allowCash', event.target.checked)} />
              </label>
              <label className="payments-option">
                <Check />
                <span><strong>Требовать подтверждение рестораном</strong><small>Заказы будут отмечаться оплаченными после подтверждения</small></span>
                <input type="checkbox" checked={settings.requireConfirmation} onChange={(event) => setField('requireConfirmation', event.target.checked)} />
              </label>
            </fieldset>
          </section>

          <section className="payments-card">
            <h2><span>З</span>Загрузить QR-код</h2>
            <p>Клиенты будут сканировать этот QR-код для быстрой оплаты</p>
            <button
              className="payments-dropzone"
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <Upload />
              <strong>Нажмите или перетащите файл сюда</strong>
              <small>PNG, JPG, SVG до 5 MB</small>
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onFileChange} hidden />
            {settings.qrUrl && (
              <article className="payments-file">
                <img src={settings.qrUrl} alt="QR-код оплаты" />
                <span><strong>qr-payment</strong><small>Загружено сейчас</small></span>
                <button type="button" onClick={() => setField('qrUrl', '')} aria-label="Удалить QR">
                  <Trash2 />
                </button>
              </article>
            )}
          </section>
        </div>

        <aside className="payments-card payments-preview">
          <div className="payments-preview-head">
            <h2><span>К</span>Как увидит клиент</h2>
            <div>
              <button className={previewTab === 'phone' ? 'is-active' : ''} type="button" onClick={() => setPreviewTab('phone')}>Телефон</button>
              <button className={previewTab === 'qr' ? 'is-active' : ''} type="button" onClick={() => setPreviewTab('qr')}>QR-код</button>
            </div>
          </div>

          <section className="payments-phone-preview">
            <header>Оплата заказа</header>
            <div>
              <h3>Оплата переводом</h3>
              <p>Переведите сумму заказа по указанным реквизитам</p>
              <PaymentPreviewLine icon={<User />} label="Получатель" value={recipientName || 'Получатель не указан'} />
              <PaymentPreviewLine icon={<Building2 />} label="Банк" value={settings.bankName || 'Банк не указан'} />
              <PaymentPreviewLine icon={<Phone />} label="Номер" value={settings.transferNumber || 'Номер не указан'} copyValue={settings.transferNumber} />
              {previewTab === 'qr' && (settings.qrUrl ? <img src={settings.qrUrl} alt="QR-код оплаты" /> : <QrCode className="payments-preview-qr-empty" />)}
              <PaymentPreviewLine icon={<CreditCard />} label="Комментарий" value={settings.comment || 'Оплата заказа переводом ресторану'} />
              <button type="button">Я оплатил заказ</button>
            </div>
          </section>
        </aside>
      </section>
      <button className="payments-save" type="button" disabled={isSaving || !selectedCatalog} onClick={save}>
        <Check />
        {isSaving ? 'Сохраняем...' : 'Сохранить платежи'}
      </button>
    </main>
  );
}

function PaymentPreviewLine({
  icon,
  label,
  value,
  copyValue
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  copyValue?: string;
}) {
  return (
    <div className="payments-preview-line">
      <span>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
      {copyValue && (
        <button type="button" onClick={() => void navigator.clipboard?.writeText(copyValue).then(() => toast.success('Скопировано'))} aria-label="Скопировать">
          <Copy />
        </button>
      )}
    </div>
  );
}
