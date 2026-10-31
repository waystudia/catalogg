import { useBackAction, useHistoryViewState, useExactBack } from '../../shared/ExactBackNavigation';
import {
  ArrowLeft,
  Bike,
  BriefcaseBusiness,
  CarFront,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileCheck2,
  FileText,
  Headphones,
  Heart,
  Home,
  Info,
  KeyRound,
  MapPin,
  MessageCircleMore,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  Upload,
  UserRound,
  UsersRound,
  X
} from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PartnerApplicationFlow } from './PartnerApplicationFlow';
import './partner-registration-preview.css';

type PreviewScreen =
  | 'profile'
  | 'roles'
  | 'seller-account'
  | 'seller-business'
  | 'seller-demo'
  | 'seller-documents'
  | 'seller-pending'
  | 'courier-account'
  | 'courier-geography'
  | 'courier-transport'
  | 'courier-pending'
  | 'admin-seller'
  | 'admin-courier';

type ScreenGroup = 'Продавец' | 'Курьер' | 'Суперадмин';

const screenGroups: Array<{ title: ScreenGroup; items: Array<{ id: PreviewScreen; label: string }> }> = [
  {
    title: 'Продавец',
    items: [
      { id: 'profile', label: 'Профиль и вход' },
      { id: 'roles', label: 'Выбор роли' },
      { id: 'seller-account', label: 'Данные владельца' },
      { id: 'seller-business', label: 'Данные бизнеса' },
      { id: 'seller-demo', label: 'Демо-кабинет' },
      { id: 'seller-documents', label: 'Документы' },
      { id: 'seller-pending', label: 'Проверка заявки' }
    ]
  },
  {
    title: 'Курьер',
    items: [
      { id: 'courier-account', label: 'Данные курьера' },
      { id: 'courier-geography', label: 'География' },
      { id: 'courier-transport', label: 'Транспорт' },
      { id: 'courier-pending', label: 'Проверка заявки' }
    ]
  },
  {
    title: 'Суперадмин',
    items: [
      { id: 'admin-seller', label: 'Заявка продавца' },
      { id: 'admin-courier', label: 'Заявка курьера' }
    ]
  }
];

const backScreen: Partial<Record<PreviewScreen, PreviewScreen>> = {
  roles: 'profile',
  'seller-account': 'roles',
  'seller-business': 'seller-account',
  'seller-demo': 'seller-business',
  'seller-documents': 'seller-demo',
  'seller-pending': 'seller-documents',
  'courier-account': 'roles',
  'courier-geography': 'courier-account',
  'courier-transport': 'courier-geography',
  'courier-pending': 'courier-transport',
  'admin-seller': 'seller-pending',
  'admin-courier': 'courier-pending'
};

const workAreas = ['Грозный', 'Аргун', 'Шали', 'Гудермес'];
const businessTypes = ['Ресторан', 'Магазин'];

function ProgressHeader({
  title,
  eyebrow,
  step,
  total,
  onBack
}: {
  title: string;
  eyebrow: string;
  step: number;
  total: number;
  onBack: () => void;
}) {
  return (
    <header className="partner-preview__screen-head">
      <button type="button" onClick={onBack} aria-label="Назад"><ArrowLeft /></button>
      <div className="partner-preview__progress-copy">
        <span>{eyebrow}</span>
        <strong>{step} из {total}</strong>
      </div>
      <div className="partner-preview__progress" aria-label={`Шаг ${step} из ${total}`}>
        {Array.from({ length: total }, (_, index) => (
          <i className={index < step ? 'is-active' : ''} key={index} />
        ))}
      </div>
      <h1>{title}</h1>
    </header>
  );
}

function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="partner-preview__field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function StickyAction({ children }: { children: ReactNode }) {
  return <footer className="partner-preview__sticky">{children}</footer>;
}

function AccountForm({ role, onBack, onNext }: { role: 'seller' | 'courier'; onBack: () => void; onNext: () => void }) {
  const seller = role === 'seller';
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onNext();
  };

  return (
    <form className="partner-preview__form-screen" onSubmit={submit}>
      <ProgressHeader
        title={seller ? 'Расскажите о себе' : 'Ваши данные'}
        eyebrow={seller ? 'Регистрация продавца' : 'Регистрация курьера'}
        step={1}
        total={seller ? 2 : 3}
        onBack={onBack}
      />
      <div className="partner-preview__intro">
        <span className="partner-preview__intro-icon"><UserRound /></span>
        <p>{seller ? 'Эти данные нужны для входа и связи с владельцем бизнеса.' : 'Создадим личный доступ. Заказы появятся только после проверки.'}</p>
      </div>
      <section className="partner-preview__form-card">
        <Field label="Имя и фамилия"><input name="name" placeholder="Имя и фамилия" autoComplete="name" required /></Field>
        <div className="partner-preview__field-row">
          <Field label="Телефон"><input name="phone" placeholder="+7" inputMode="tel" autoComplete="tel" required /></Field>
          <Field label="Почта"><input name="email" placeholder="name@example.ru" type="email" autoComplete="email" required /></Field>
        </div>
        <Field label="Пароль" hint="Минимум 8 символов">
          <span className="partner-preview__password"><KeyRound /><input name="password" type="password" minLength={8} autoComplete="new-password" required /></span>
        </Field>
      </section>
      <label className="partner-preview__check">
        <input type="checkbox" required />
        <span><Check />Принимаю условия и согласие на обработку данных</span>
      </label>
      <StickyAction><button className="partner-preview__primary" type="submit">Продолжить <ChevronRight /></button></StickyAction>
    </form>
  );
}

function RoleSelection({ onBack, go }: { onBack: () => void; go: (screen: PreviewScreen) => void }) {
  return (
    <section className="partner-preview__role-screen">
      <button className="partner-preview__standalone-back" type="button" onClick={onBack} aria-label="Назад"><ArrowLeft /></button>
      <span className="partner-preview__eyebrow">Новый аккаунт</span>
      <h1>Как будете работать?</h1>
      <p>Выберите один вариант. Роль можно изменить только через поддержку.</p>
      <div className="partner-preview__role-list">
        <button className="is-seller" type="button" onClick={() => go('seller-account')}>
          <span><Store /></span>
          <div><strong>Продавец</strong><small>Ресторан, кафе, кондитерская или магазин</small></div>
          <ChevronRight />
        </button>
        <button className="is-courier" type="button" onClick={() => go('courier-account')}>
          <span><CarFront /></span>
          <div><strong>Курьер</strong><small>Доставка заказов в выбранных районах</small></div>
          <ChevronRight />
        </button>
      </div>
      <div className="partner-preview__safe-note"><ShieldCheck /><span><strong>Без автоматического запуска</strong><small>Данные проверит администратор WayYaam.</small></span></div>
      <button className="partner-preview__text-action" type="button" onClick={() => go('profile')}>Уже есть аккаунт? Войти</button>
    </section>
  );
}

function SellerBusiness({ onBack, onNext, initialType }: { onBack: () => void; onNext: () => void; initialType?: string }) {
  const [type, setType] = useState(initialType ?? 'Ресторан');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onNext();
  };
  return (
    <form className="partner-preview__form-screen" onSubmit={submit}>
      <ProgressHeader title="Добавьте бизнес" eyebrow="Регистрация продавца" step={2} total={2} onBack={onBack} />
      <section className="partner-preview__form-card">
        <fieldset className="partner-preview__choice-field">
          <legend>Тип бизнеса</legend>
          <div>
            {businessTypes.map((item) => (
              <button className={type === item ? 'is-active' : ''} type="button" onClick={() => setType(item)} key={item}>{item}</button>
            ))}
          </div>
        </fieldset>
        <Field label="Название"><input defaultValue="Беркат" required /></Field>
        <div className="partner-preview__field-row">
          <Field label="Рабочий телефон"><input defaultValue="+7 928 000-33-96" inputMode="tel" required /></Field>
          <Field label="Основной город"><select defaultValue="Грозный"><option>Грозный</option><option>Аргун</option><option>Шали</option></select></Field>
        </div>
      </section>
      <section className="partner-preview__zone-card">
        <span><MapPin /></span>
        <div><strong>Где принимаете заказы</strong><small>Грозный · Центральная зона</small></div>
        <button type="button">Изменить</button>
      </section>
      <div className="partner-preview__demo-note"><Sparkles /><p><strong>Демо-режим</strong><small>Каталог останется закрытым до подтверждения WayYaam.</small></p></div>
      <StickyAction><button className="partner-preview__primary" type="submit">Создать демо-кабинет <ChevronRight /></button></StickyAction>
    </form>
  );
}

function SellerDemo({ onDocuments, onAdmin }: { onDocuments: () => void; onAdmin: () => void }) {
  return (
    <section className="partner-preview__status-screen">
      <div className="partner-preview__review-notice">Демо-режим · Ожидается подтверждение со стороны WayYaam</div>
      <div className="partner-preview__status-top">
        <span className="partner-preview__status-mark"><Check /></span>
        <span className="partner-preview__eyebrow">Беркат</span>
        <h1>Кабинет готов</h1>
        <p>Можно собрать каталог и подготовить бизнес к запуску.</p>
      </div>
      <section className="partner-preview__checklist">
        <header><strong>До запуска</strong><span>1 из 3</span></header>
        <div className="is-done"><Check /><span><strong>Кабинет создан</strong><small>Основные данные сохранены</small></span></div>
        <button type="button"><ShoppingBag /><span><strong>Добавить товары</strong><small>Категории, фото и цены</small></span><ChevronRight /></button>
        <button type="button" onClick={onDocuments}><FileCheck2 /><span><strong>Подтвердить бизнес</strong><small>Реквизиты и документы</small></span><ChevronRight /></button>
      </section>
      <div className="partner-preview__lock-note"><ShieldCheck /><span>Пока идёт проверка, покупатели не видят каталог и не могут оформить реальный заказ.</span></div>
      <StickyAction>
        <button className="partner-preview__primary" type="button" onClick={onDocuments}>Заполнить документы <ChevronRight /></button>
        <button className="partner-preview__secondary" type="button" onClick={onAdmin}>Посмотреть заявку в админке</button>
      </StickyAction>
    </section>
  );
}

function SellerDocuments({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [legalType, setLegalType] = useState('Самозанятый');
  const [uploads, setUploads] = useState<string[]>([]);
  const toggleUpload = (name: string) => setUploads((current) => current.includes(name) ? current : [...current, name]);
  return (
    <form className="partner-preview__form-screen" onSubmit={(event) => { event.preventDefault(); onNext(); }}>
      <header className="partner-preview__simple-head">
        <button type="button" onClick={onBack} aria-label="Назад"><ArrowLeft /></button>
        <span className="partner-preview__eyebrow">Проверка продавца</span>
        <h1>Подтвердите бизнес</h1>
        <p>Заполните реквизиты и приложите читаемые документы.</p>
      </header>
      <section className="partner-preview__form-card">
        <fieldset className="partner-preview__choice-field">
          <legend>Правовой статус</legend>
          <div>{['Самозанятый', 'ИП', 'ООО'].map((item) => <button className={legalType === item ? 'is-active' : ''} type="button" onClick={() => setLegalType(item)} key={item}>{item}</button>)}</div>
        </fieldset>
        <Field label="ИНН"><input defaultValue="201234567890" inputMode="numeric" required /></Field>
        <Field label={legalType === 'Самозанятый' ? 'ФИО' : 'Юридическое название'}><input defaultValue={legalType === 'Самозанятый' ? 'Алиев Муса Хамзатович' : 'ИП Алиев Муса Хамзатович'} required /></Field>
      </section>
      <section className="partner-preview__upload-card">
        <header><span><FileCheck2 /></span><div><strong>Документы</strong><small>JPG, PNG или PDF · до 10 МБ</small></div></header>
        {['Регистрация бизнеса', 'Документ личности'].map((name) => (
          <button className={uploads.includes(name) ? 'is-uploaded' : ''} type="button" onClick={() => toggleUpload(name)} key={name}>
            {uploads.includes(name) ? <CheckCircle2 /> : <Upload />}
            <span><strong>{name}</strong><small>{uploads.includes(name) ? 'Файл добавлен' : 'Нажмите, чтобы выбрать файл'}</small></span>
            <ChevronRight />
          </button>
        ))}
      </section>
      <label className="partner-preview__check"><input type="checkbox" defaultChecked required /><span><Check />Подтверждаю достоверность данных</span></label>
      <StickyAction><button className="partner-preview__primary" type="submit" disabled={uploads.length < 2}>Отправить на проверку <ChevronRight /></button></StickyAction>
    </form>
  );
}

function PendingScreen({ role, onEdit, onAdmin }: { role: 'seller' | 'courier'; onEdit: () => void; onAdmin: () => void }) {
  const seller = role === 'seller';
  return (
    <section className="partner-preview__pending-screen">
      <div className="partner-preview__review-notice">Демо-режим · Ожидается подтверждение со стороны WayYaam</div>
      <div className="partner-preview__pending-orbit"><span><Clock3 /></span></div>
      <span className="partner-preview__eyebrow">Заявка № 0248</span>
      <h1>Проверяем данные</h1>
      <p>{seller ? 'Каталог сохранён в демо. Мы проверим реквизиты и документы.' : 'Пока заявка на проверке, доступ к заказам закрыт.'}</p>
      <section className="partner-preview__pending-card">
        <header><span className="is-review">На проверке</span><small>до 1 рабочего дня</small></header>
        <div><span>{seller ? <Store /> : <UserRound />}</span><p><small>{seller ? 'Бизнес' : 'Курьер'}</small><strong>{seller ? 'Беркат · Магазин' : 'Ахмед Исаев'}</strong></p></div>
        <div><span>{seller ? <FileText /> : <CarFront />}</span><p><small>{seller ? 'Документы' : 'Транспорт'}</small><strong>{seller ? '2 файла' : 'Lada Granta · А123ВС 95'}</strong></p></div>
        <div><span><MapPin /></span><p><small>{seller ? 'Зона заказов' : 'Рабочая зона'}</small><strong>{seller ? 'Грозный · Центральная' : 'Грозный, Аргун'}</strong></p></div>
      </section>
      <div className="partner-preview__safe-note"><MessageCircleMore /><span><strong>Сообщим о решении</strong><small>Уведомление появится в приложении и WhatsApp.</small></span></div>
      <StickyAction>
        <button className="partner-preview__primary" type="button" onClick={onAdmin}>Как это видит суперадмин <ChevronRight /></button>
        <button className="partner-preview__secondary" type="button" onClick={onEdit}>Изменить анкету</button>
      </StickyAction>
    </section>
  );
}

function CourierGeography({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [areas, setAreas] = useState(['Грозный', 'Аргун']);
  const toggleArea = (area: string) => setAreas((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area]);
  return (
    <section className="partner-preview__form-screen">
      <ProgressHeader title="Где будете работать" eyebrow="Регистрация курьера" step={2} total={3} onBack={onBack} />
      <section className="partner-preview__form-card">
        <Field label="Место проживания"><select defaultValue="Грозный"><option>Грозный</option><option>Аргун</option><option>Шали</option></select></Field>
      </section>
      <section className="partner-preview__area-picker">
        <header><span><MapPin /></span><div><strong>Рабочая зона</strong><small>Выберите один или несколько городов</small></div></header>
        <div>{workAreas.map((area) => <button className={areas.includes(area) ? 'is-active' : ''} type="button" onClick={() => toggleArea(area)} key={area}>{areas.includes(area) && <Check />}{area}</button>)}</div>
      </section>
      <div className="partner-preview__zone-preview">
        <div><span /><span /><span /></div>
        <p><strong>{areas.length || 0} зоны выбрано</strong><small>После активации здесь будут доступны подходящие заказы.</small></p>
      </div>
      <StickyAction><button className="partner-preview__primary" type="button" disabled={areas.length === 0} onClick={onNext}>Выбрать транспорт <ChevronRight /></button></StickyAction>
    </section>
  );
}

function CourierTransport({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [vehicle, setVehicle] = useState('Легковой');
  const [color, setColor] = useState('Белый');
  const colors = [
    { name: 'Белый', value: '#f8f8f6' },
    { name: 'Чёрный', value: '#28282b' },
    { name: 'Серый', value: '#9ca0a8' },
    { name: 'Синий', value: '#395fbe' },
    { name: 'Красный', value: '#c84646' }
  ];
  return (
    <form className="partner-preview__form-screen" onSubmit={(event) => { event.preventDefault(); onNext(); }}>
      <ProgressHeader title="Ваш транспорт" eyebrow="Регистрация курьера" step={3} total={3} onBack={onBack} />
      <fieldset className="partner-preview__vehicle-types">
        <legend>Как доставляете</legend>
        <div>
          {[
            { name: 'Легковой', Icon: CarFront },
            { name: 'Фургон', Icon: Truck },
            { name: 'Мото', Icon: Bike }
          ].map(({ name, Icon }) => (
            <button className={vehicle === name ? 'is-active' : ''} type="button" onClick={() => setVehicle(name)} key={name}><Icon /><span>{name}</span>{vehicle === name && <Check />}</button>
          ))}
        </div>
      </fieldset>
      <section className="partner-preview__vehicle-card">
        <header><span><CarFront /></span><div><strong>Автомобиль</strong><small>Данные будут видны клиенту при доставке</small></div></header>
        <div className="partner-preview__field-row">
          <Field label="Марка"><input defaultValue="Lada" required /></Field>
          <Field label="Модель"><input defaultValue="Granta" required /></Field>
        </div>
        <Field label="Госномер">
          <span className="partner-preview__plate"><input aria-label="Госномер" defaultValue="А123ВС" maxLength={6} required /><i /><input aria-label="Регион" defaultValue="95" maxLength={3} inputMode="numeric" required /><b>RUS</b></span>
        </Field>
        <fieldset className="partner-preview__colors">
          <legend>Цвет · {color}</legend>
          <div>{colors.map((item) => <button className={color === item.name ? 'is-active' : ''} style={{ '--vehicle-color': item.value } as React.CSSProperties} type="button" aria-label={item.name} onClick={() => setColor(item.name)} key={item.name}>{color === item.name && <Check />}</button>)}</div>
        </fieldset>
        <button className="partner-preview__scan" type="button"><ScanLine /><span><strong>Сканировать СТС</strong><small>Заполним марку, модель и номер</small></span><ChevronRight /></button>
      </section>
      <StickyAction><button className="partner-preview__primary" type="submit">Отправить заявку <ChevronRight /></button></StickyAction>
    </form>
  );
}

function AdminApplication({ role, go }: { role: 'seller' | 'courier'; go: (screen: PreviewScreen) => void }) {
  const seller = role === 'seller';
  const [decision, setDecision] = useState('');
  return (
    <section className="partner-preview__admin-screen">
      <header>
        <button type="button" onClick={() => go(seller ? 'seller-pending' : 'courier-pending')} aria-label="Закрыть"><X /></button>
        <span className="partner-preview__admin-brand"><ShieldCheck /> WayYaam Admin</span>
        <h1>{seller ? 'Заявка продавца' : 'Заявка курьера'}</h1>
        <p>Саморегистрация · № 0248</p>
      </header>
      {decision ? (
        <section className="partner-preview__decision">
          <span><Check /></span>
          <h2>{decision}</h2>
          <p>{seller ? 'Бизнес перейдёт к действующему юридическому подтверждению.' : 'Курьер получит доступ к текущему кабинету и подходящим заказам.'}</p>
          <button type="button" onClick={() => setDecision('')}>Вернуться к заявке</button>
        </section>
      ) : (
        <>
          <section className="partner-preview__admin-applicant">
            <span>{seller ? <Store /> : <UserRound />}</span>
            <div><small>{seller ? 'Магазин' : 'Курьер'}</small><strong>{seller ? 'Беркат' : 'Ахмед Исаев'}</strong><p><i /> На проверке</p></div>
          </section>
          <section className="partner-preview__admin-data">
            <h2>Основные данные</h2>
            <div><span><UserRound /></span><p><small>{seller ? 'Владелец' : 'Телефон'}</small><strong>{seller ? 'Муса Алиев' : '+7 900 000-00-00'}</strong></p></div>
            <div><span><MapPin /></span><p><small>{seller ? 'Город и зона' : 'Живёт / работает'}</small><strong>{seller ? 'Грозный · Центральная' : 'Грозный / Грозный, Аргун'}</strong></p></div>
            <div><span>{seller ? <FileText /> : <CarFront />}</span><p><small>{seller ? 'ИНН и документы' : 'Транспорт'}</small><strong>{seller ? '20••••••••90 · 2 файла' : 'Lada Granta · А123ВС 95 · Белый'}</strong></p></div>
          </section>
          <section className="partner-preview__admin-checks">
            <h2>Автоматические проверки</h2>
            <div><CheckCircle2 /><span><strong>{seller ? 'Документы приложены' : 'География заполнена'}</strong><small>{seller ? 'файлы доступны только суперадмину' : '2 рабочие зоны'}</small></span></div>
          </section>
          <StickyAction>
            <button className="partner-preview__primary" type="button" onClick={() => setDecision(seller ? 'Продавец одобрен' : 'Курьер активирован')}>{seller ? 'Одобрить продавца' : 'Активировать курьера'} <Check /></button>
            <button className="partner-preview__secondary" type="button" onClick={() => setDecision('Отправлено на исправление')}>Вернуть на исправление</button>
          </StickyAction>
        </>
      )}
    </section>
  );
}

function ProfileEntry({ go }: { go: (screen: PreviewScreen) => void }) {
  const menu = [
    { label: 'Мои заказы', Icon: ReceiptText },
    { label: 'Избранное', Icon: Heart },
    { label: 'Адреса доставки', Icon: MapPin },
    { label: 'Поддержка', Icon: Headphones }
  ];
  return (
    <section className="partner-preview__profile">
      <span className="partner-preview__eyebrow">Профиль</span>
      <h1>Личный кабинет</h1>
      <section className="partner-preview__guest">
        <span><CircleUserRound /></span>
        <div><strong>Гость WayYaam</strong><small>Войдите, чтобы видеть историю заказов</small></div>
      </section>
      <section className="partner-preview__auth-card">
        <div className="partner-preview__segments">
          <button type="button">Войти</button>
          <button className="is-active" type="button" onClick={() => go('roles')}>Регистрация</button>
        </div>
        <div className="partner-preview__auth-hero"><span><UsersRound /></span><p><strong>Начните работать с WayYaam</strong><small>Самостоятельная регистрация продавца или курьера</small></p></div>
        <button className="partner-preview__primary" type="button" onClick={() => go('roles')}>Выбрать роль <ChevronRight /></button>
        <button className="partner-preview__buyer-link" type="button">Создать аккаунт покупателя</button>
      </section>
      <nav className="partner-preview__profile-menu">
        {menu.map(({ label, Icon }) => <button type="button" key={label}><span><Icon /></span><strong>{label}</strong><ChevronRight /></button>)}
      </nav>
      <footer className="partner-preview__tabbar"><button type="button"><Home />Главная</button><button className="is-active" type="button"><UserRound />Профиль</button></footer>
    </section>
  );
}

function ScreenContent({ screen, go, initialBusinessType }: { screen: PreviewScreen; go: (screen: PreviewScreen) => void; initialBusinessType?: string }) {
  const back = useBackAction(() => go(backScreen[screen] ?? 'profile'));
  switch (screen) {
    case 'profile': return <ProfileEntry go={go} />;
    case 'roles': return <RoleSelection onBack={back} go={go} />;
    case 'seller-account': return <AccountForm role="seller" onBack={back} onNext={() => go('seller-business')} />;
    case 'seller-business': return <SellerBusiness onBack={back} onNext={() => go('seller-demo')} initialType={initialBusinessType} />;
    case 'seller-demo': return <SellerDemo onDocuments={() => go('seller-documents')} onAdmin={() => go('admin-seller')} />;
    case 'seller-documents': return <SellerDocuments onBack={back} onNext={() => go('seller-pending')} />;
    case 'seller-pending': return <PendingScreen role="seller" onEdit={() => go('seller-documents')} onAdmin={() => go('admin-seller')} />;
    case 'courier-account': return <AccountForm role="courier" onBack={back} onNext={() => go('courier-geography')} />;
    case 'courier-geography': return <CourierGeography onBack={back} onNext={() => go('courier-transport')} />;
    case 'courier-transport': return <CourierTransport onBack={back} onNext={() => go('courier-pending')} />;
    case 'courier-pending': return <PendingScreen role="courier" onEdit={() => go('courier-transport')} onAdmin={() => go('admin-courier')} />;
    case 'admin-seller': return <AdminApplication role="seller" go={go} />;
    case 'admin-courier': return <AdminApplication role="courier" go={go} />;
  }
}

export function PartnerRegistrationPreview() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const backToApp = useExactBack('/profile');
  const start = searchParams.get('start');
  const directEntry = start === 'courier' || start === 'restaurant' || start === 'shop';
  const initialScreen: PreviewScreen = start === 'courier' ? 'courier-account' : directEntry ? 'seller-account' : 'profile';
  const [screen, setScreen] = useHistoryViewState<PreviewScreen>('registration.preview.screen', initialScreen);
  const activeLabel = useMemo(() => screenGroups.flatMap((group) => group.items).find((item) => item.id === screen)?.label ?? '', [screen]);

  const go = (next: PreviewScreen) => {
    if (directEntry && screen === initialScreen && next === 'roles') {
      navigate(start === 'courier' ? '/profile/partners' : '/profile/partners/business');
      return;
    }
    setScreen(next);
    document.querySelector('.partner-preview__device-screen')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (directEntry) {
    return (
      <main className="partner-preview partner-preview--direct">
        <div className="partner-preview__device-screen" data-navigation-scroll="partner-screen">
          <PartnerApplicationFlow kind={start} />
        </div>
      </main>
    );
  }

  return (
    <main className="partner-preview">
      <header className="partner-preview__workspace-head">
        <div><span><Sparkles /> Локальный прототип</span><h1>Саморегистрация партнёров</h1><p>Обновлённый интерфейс · данные не отправляются в Supabase</p></div>
        <button type="button" onClick={backToApp}><ArrowLeft /> Вернуться в приложение</button>
      </header>
      <div className="partner-preview__workspace">
        <aside className="partner-preview__navigator">
          <header><strong>Все экраны</strong><small>{activeLabel}</small></header>
          {screenGroups.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              {group.items.map((item, index) => (
                <button className={screen === item.id ? 'is-active' : ''} type="button" onClick={() => go(item.id)} key={item.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>{item.label}<ChevronRight />
                </button>
              ))}
            </section>
          ))}
        </aside>
        <section className="partner-preview__device-wrap" aria-label="Интерактивный мобильный прототип">
          <div className="partner-preview__device">
            <div className="partner-preview__device-bar"><span>13:08</span><i /><strong>WayYaam</strong><div><span /><span /><span /></div></div>
            <div className="partner-preview__device-screen" data-navigation-scroll="partner-screen"><ScreenContent screen={screen} go={go} /></div>
          </div>
        </section>
        <aside className="partner-preview__notes">
          <span className="partner-preview__notes-icon"><Info /></span>
          <h2>Что изменено</h2>
          <ul>
            <li><Check />Пошаговый прогресс вместо длинной формы</li>
            <li><Check />Чипы бизнеса и географии</li>
            <li><Check />Новая карточка транспорта</li>
            <li><Check />Отдельные статусы демо и проверки</li>
            <li><Check />Текущие кабинеты не заменяются</li>
          </ul>
          <div><ShieldCheck /><p><strong>Безопасный preview</strong><small>Кнопки и формы работают только в памяти этой страницы.</small></p></div>
          <button type="button" onClick={() => go('roles')}><BriefcaseBusiness /> Начать сначала</button>
        </aside>
      </div>
    </main>
  );
}
