import { ArrowLeft, CheckCircle2, Store, Truck } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { navigateBackOrFallback } from '../../shared/appNavigation';
import { legalDocuments } from '../../shared/legalDocuments';
import { useBrowserBackedState } from '../../shared/useBrowserBackedState';
import { registerPartner, type PartnerRole } from './partnerRegistrationApi';
import './partner-registration.css';

const settlements = ['Грозный', 'Аргун', 'Шали', 'Урус-Мартан', 'Гудермес'];
const initialRegistrationFlow: { role: PartnerRole | null; step: number } = { role: null, step: 1 };

export function PartnerRegistrationPage() {
  const navigate = useNavigate();
  const [flow, flowHistory] = useBrowserBackedState('partner-registration:flow', initialRegistrationFlow);
  const { role, step } = flow;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [businessType, setBusinessType] = useState('restaurant');
  const [businessName, setBusinessName] = useState('');
  const [primaryCity, setPrimaryCity] = useState('Грозный');
  const [serviceSettlements, setServiceSettlements] = useState<string[]>(['Грозный']);
  const [residencePlace, setResidencePlace] = useState('');
  const [transportType, setTransportType] = useState<'car' | 'van' | 'motorcycle'>('car');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ role: PartnerRole; slug?: string } | null>(null);

  const maxStep = role === 'driver' ? 3 : 2;
  const title = useMemo(() => role === 'driver' ? 'Регистрация курьера' : 'Регистрация продавца', [role]);

  const toggleSettlement = (value: string) => setServiceSettlements((current) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
  );

  const next = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== passwordRepeat) return setError('Пароли не совпадают.');
    if (password.length < 8) return setError('Пароль должен содержать минимум 8 символов.');
    flowHistory.open((current) => ({ ...current, step: Math.min(current.step + 1, maxStep) }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!role || !accepted) return;
    setSaving(true);
    setError('');
    try {
      const response = await registerPartner({
        role, name, phone, email, password, businessType, businessName,
        primaryCity, serviceSettlements, residencePlace, transportType,
        vehicleMake, vehicleModel, vehicleColor, carNumber
      });
      setResult({ role, slug: response.registration.catalog_slug });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить заявку.');
    } finally {
      setSaving(false);
    }
  };

  if (result) return (
    <main className="partner-registration">
      <section className="partner-registration__success">
        <CheckCircle2 />
        <h1>Заявка создана</h1>
        <p>{result.role === 'seller'
          ? 'Кабинет настройки доступен на 48 часов. Добавьте каталог и отправьте реквизиты на проверку. Покупатели пока не видят бизнес.'
          : 'Данные курьера отправлены администратору. Доступ к заказам откроется только после одобрения.'}</p>
        <button onClick={() => navigate(result.role === 'seller' ? '/partner-registration/documents' : '/profile')}>{result.role === 'seller' ? 'Отправить документы' : 'Готово'}</button>
      </section>
    </main>
  );

  if (!role) return (
    <main className="partner-registration">
      <header><button aria-label="Назад" onClick={() => navigateBackOrFallback(navigate, '/profile')}><ArrowLeft /></button><span>Регистрация партнёра</span></header>
      <section className="partner-registration__intro">
        <small>РАБОТА С WAYYAAM</small><h1>Как будете работать?</h1><p>Выберите роль. Аккаунт покупателя создаётся отдельно в профиле.</p>
        <button className="partner-registration__role" onClick={() => flowHistory.open({ role: 'seller', step: 1 })}><span><Store /></span><b>Продавец</b><small>Ресторан, кафе, кондитерская или магазин</small></button>
        <button className="partner-registration__role" onClick={() => flowHistory.open({ role: 'driver', step: 1 })}><span><Truck /></span><b>Курьер</b><small>Доставка заказов в выбранных районах</small></button>
      </section>
    </main>
  );

  return (
    <main className="partner-registration">
      <header><button aria-label="Назад" onClick={() => flowHistory.back()}><ArrowLeft /></button><span>{title}</span><em>{step} из {maxStep}</em></header>
      <div className="partner-registration__progress">{Array.from({ length: maxStep }, (_, index) => <i className={index < step ? 'is-active' : ''} key={index} />)}</div>

      {step === 1 && <form onSubmit={next}>
        <small>АККАУНТ</small><h1>Расскажите о себе</h1><p>Телефон сохраняется без проверки кода. Вход выполняется по почте и паролю.</p>
        <label>Имя и фамилия<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} /></label>
        <label>Телефон<input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" placeholder="+7 928 000-00-00" required /></label>
        <label>Почта<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
        <label>Пароль<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label>
        <label>Повторите пароль<input value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} type="password" autoComplete="new-password" required /></label>
        {error && <strong role="alert">{error}</strong>}<button className="partner-registration__primary">Продолжить</button>
      </form>}

      {role === 'seller' && step === 2 && <form onSubmit={submit}>
        <small>БИЗНЕС</small><h1>Добавьте бизнес</h1><p>Создадим закрытый кабинет настройки на 48 часов.</p>
        <label>Тип бизнеса<select value={businessType} onChange={(event) => setBusinessType(event.target.value)}><option value="restaurant">Ресторан</option><option value="coffee_shop">Кофейня или кафе</option><option value="confectionery">Кондитерская</option><option value="grocery">Продуктовый магазин</option></select></label>
        <label>Название<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Название ресторана или магазина" required /></label>
        <label>Основной город<input value={primaryCity} onChange={(event) => setPrimaryCity(event.target.value)} required /></label>
        <fieldset><legend>Где принимаете заказы</legend><div className="partner-registration__chips">{settlements.map((item) => <button className={serviceSettlements.includes(item) ? 'is-active' : ''} type="button" onClick={() => toggleSettlement(item)} key={item}>{item}</button>)}</div></fieldset>
        <label className="partner-registration__consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /><span>Принимаю <a href={legalDocuments.restaurantOffer} target="_blank" rel="noreferrer">условия для продавцов</a> и <a href={legalDocuments.restaurantConsent} target="_blank" rel="noreferrer">согласие на обработку данных</a>.</span></label>
        {error && <strong role="alert">{error}</strong>}<button className="partner-registration__primary" disabled={saving}>{saving ? 'Создаём кабинет…' : 'Создать заявку'}</button>
      </form>}

      {role === 'driver' && step === 2 && <form onSubmit={(event) => { event.preventDefault(); flowHistory.open({ role: 'driver', step: 3 }); }}>
        <small>ГЕОГРАФИЯ</small><h1>Где будете работать?</h1><p>Выберите место проживания и районы доставки.</p>
        <label>Где проживаете<input value={residencePlace} onChange={(event) => setResidencePlace(event.target.value)} required /></label>
        <label>Основной город работы<input value={primaryCity} onChange={(event) => setPrimaryCity(event.target.value)} required /></label>
        <fieldset><legend>Районы работы</legend><div className="partner-registration__chips">{settlements.map((item) => <button className={serviceSettlements.includes(item) ? 'is-active' : ''} type="button" onClick={() => toggleSettlement(item)} key={item}>{item}</button>)}</div></fieldset>
        <button className="partner-registration__primary">Выбрать транспорт</button>
      </form>}

      {role === 'driver' && step === 3 && <form onSubmit={submit}>
        <small>ТРАНСПОРТ</small><h1>Ваш транспорт</h1><p>Эти данные увидит администратор при проверке заявки.</p>
        <fieldset><legend>Как доставляете</legend><div className="partner-registration__transport">{[['car','Легковой'],['van','Фургон'],['motorcycle','Мото']].map(([value,label]) => <button className={transportType === value ? 'is-active' : ''} type="button" onClick={() => setTransportType(value as typeof transportType)} key={value}><Truck />{label}</button>)}</div></fieldset>
        <div className="partner-registration__columns"><label>Марка<input value={vehicleMake} onChange={(event) => setVehicleMake(event.target.value)} required /></label><label>Модель<input value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} required /></label></div>
        <label>Госномер<input value={carNumber} onChange={(event) => setCarNumber(event.target.value.toUpperCase())} placeholder="А123ВС 95" required /></label>
        <label>Цвет<input value={vehicleColor} onChange={(event) => setVehicleColor(event.target.value)} required /></label>
        <label className="partner-registration__consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /><span>Принимаю <a href={legalDocuments.driverOffer} target="_blank" rel="noreferrer">условия курьера</a> и <a href={legalDocuments.driverConsent} target="_blank" rel="noreferrer">согласие на обработку данных</a>.</span></label>
        {error && <strong role="alert">{error}</strong>}<button className="partner-registration__primary" disabled={saving}>{saving ? 'Отправляем…' : 'Отправить заявку'}</button>
      </form>}
    </main>
  );
}
