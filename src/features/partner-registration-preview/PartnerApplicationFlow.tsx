import { useBackAction, useExactBack, useHistoryViewState } from '../../shared/ExactBackNavigation';
import {
  ArrowLeft,
  Bike,
  Building2,
  Check,
  ChevronRight,
  CircleCheckBig,
  MapPin,
  Store,
  UserRound
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  submitPartnerApplication,
  type PartnerApplicationKind
} from '../../shared/api/partnerApplicationsApi';

type AccountDraft = {
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string;
  acceptedTerms: boolean;
};

const emptyAccount: AccountDraft = {
  applicantName: '',
  applicantPhone: '',
  applicantEmail: '',
  acceptedTerms: false
};

const workAreas = ['Грозный', 'Аргун', 'Шали', 'Гудермес'];

function FlowHeader({ title, step, total, onBack }: { title: string; step: number; total: number; onBack: () => void }) {
  return (
    <header className="partner-application__header">
      <button type="button" onClick={onBack} aria-label="Назад"><ArrowLeft /></button>
      <span><small>Шаг {step} из {total}</small><strong>{title}</strong></span>
      <div className="partner-application__progress" aria-label={`Шаг ${step} из ${total}`}>
        {Array.from({ length: total }, (_, index) => <i className={index < step ? 'is-active' : ''} key={index} />)}
      </div>
    </header>
  );
}

export function PartnerApplicationFlow({ kind }: { kind: PartnerApplicationKind }) {
  const navigate = useNavigate();
  const isCourier = kind === 'courier';
  const total = isCourier ? 3 : 2;
  const [step, setStep] = useHistoryViewState('partner.application.step', 1);
  const backToEntry = useExactBack(isCourier ? '/profile/partners' : '/profile/partners/business');
  const [account, setAccount] = useState<AccountDraft>(emptyAccount);
  const [details, setDetails] = useState<Record<string, unknown>>({
    businessType: kind === 'shop' ? 'Магазин' : 'Ресторан',
    city: 'Грозный',
    workAreas: ['Грозный']
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [applicationId, setApplicationId] = useState('');

  const back = useBackAction(() => {
    if (step > 1) {
      setStep((current) => current - 1);
      setError('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    backToEntry();
  });

  const submitAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAccount({
      applicantName: String(form.get('name') ?? '').trim(),
      applicantPhone: String(form.get('phone') ?? '').trim(),
      applicantEmail: String(form.get('email') ?? '').trim(),
      acceptedTerms: form.get('acceptedTerms') === 'on'
    });
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const send = async (nextDetails: Record<string, unknown>) => {
    setError('');
    setIsSubmitting(true);
    try {
      const id = await submitPartnerApplication({
        kind,
        applicantName: account.applicantName,
        applicantPhone: account.applicantPhone,
        applicantEmail: account.applicantEmail,
        details: nextDetails,
        acceptedTerms: account.acceptedTerms
      });
      setDetails(nextDetails);
      setApplicationId(id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось отправить заявку.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitBusiness = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send({
      businessType: kind === 'shop' ? 'Магазин' : 'Ресторан',
      businessName: String(form.get('businessName') ?? '').trim(),
      businessPhone: String(form.get('businessPhone') ?? '').trim(),
      city: String(form.get('city') ?? '')
    });
  };

  const submitGeography = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const workAreasValue = form.getAll('workAreas').map(String);
    setDetails({
      ...details,
      city: String(form.get('city') ?? ''),
      workAreas: workAreasValue
    });
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitTransport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send({
      ...details,
      vehicleType: String(form.get('vehicleType') ?? ''),
      vehicleBrand: String(form.get('vehicleBrand') ?? '').trim(),
      vehicleModel: String(form.get('vehicleModel') ?? '').trim(),
      carNumber: String(form.get('carNumber') ?? '').trim(),
      carRegion: String(form.get('carRegion') ?? '').trim()
    });
  };

  if (applicationId) {
    return (
      <section className="partner-application__success" aria-live="polite">
        <span><CircleCheckBig /></span>
        <small>Заявка № {applicationId.slice(0, 8).toUpperCase()}</small>
        <h1>Заявка отправлена</h1>
        <p>WayYaam проверит данные и свяжется с вами. Доступ к кабинету появится после одобрения.</p>
        <button className="partner-preview__primary" type="button" onClick={() => navigate('/profile')}>Вернуться в профиль</button>
      </section>
    );
  }

  if (step === 1) {
    return (
      <form className="partner-application__screen" onSubmit={submitAccount}>
        <FlowHeader title={isCourier ? 'Данные курьера' : 'Контактные данные'} step={1} total={total} onBack={back} />
        <section className="partner-application__intro"><UserRound /><span><strong>Расскажите о себе</strong><small>После проверки мы настроим доступ к рабочему кабинету.</small></span></section>
        <section className="partner-application__card">
          <label><span>Имя и фамилия</span><input name="name" defaultValue={account.applicantName} autoComplete="name" required /></label>
          <label><span>Телефон</span><input name="phone" defaultValue={account.applicantPhone} placeholder="+7" inputMode="tel" autoComplete="tel" required /></label>
          <label><span>Почта</span><input name="email" defaultValue={account.applicantEmail} placeholder="name@example.ru" type="email" autoComplete="email" required /></label>
        </section>
        <label className="partner-application__consent"><input name="acceptedTerms" type="checkbox" defaultChecked={account.acceptedTerms} required /><span><Check />Принимаю условия и согласие на обработку персональных данных</span></label>
        <footer className="partner-application__footer"><button className="partner-preview__primary" type="submit">Продолжить <ChevronRight /></button></footer>
      </form>
    );
  }

  if (!isCourier) {
    return (
      <form className="partner-application__screen" onSubmit={submitBusiness}>
        <FlowHeader title="Данные бизнеса" step={2} total={total} onBack={back} />
        <section className="partner-application__intro">{kind === 'shop' ? <Building2 /> : <Store />}<span><strong>{kind === 'shop' ? 'Магазин' : 'Ресторан'}</strong><small>Заявка сразу поступит на проверку WayYaam.</small></span></section>
        <section className="partner-application__card">
          <label><span>Название</span><input name="businessName" required /></label>
          <label><span>Рабочий телефон</span><input name="businessPhone" defaultValue={account.applicantPhone} inputMode="tel" required /></label>
          <label><span>Основной город</span><select name="city" defaultValue="Грозный"><option>Грозный</option><option>Аргун</option><option>Шали</option><option>Гудермес</option></select></label>
        </section>
        {error && <p className="partner-application__error" role="alert">{error}</p>}
        <footer className="partner-application__footer"><button className="partner-preview__primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Отправляем…' : 'Отправить заявку'} <ChevronRight /></button></footer>
      </form>
    );
  }

  if (step === 2) {
    const selectedAreas = Array.isArray(details.workAreas) ? details.workAreas.map(String) : ['Грозный'];
    return (
      <form className="partner-application__screen" onSubmit={submitGeography}>
        <FlowHeader title="Где будете работать" step={2} total={total} onBack={back} />
        <section className="partner-application__intro"><MapPin /><span><strong>Рабочая зона</strong><small>Можно выбрать несколько городов.</small></span></section>
        <section className="partner-application__card">
          <label><span>Место проживания</span><select name="city" defaultValue={String(details.city ?? 'Грозный')}><option>Грозный</option><option>Аргун</option><option>Шали</option><option>Гудермес</option></select></label>
          <fieldset className="partner-application__areas"><legend>Где готовы доставлять</legend>{workAreas.map((area) => <label key={area}><input name="workAreas" type="checkbox" value={area} defaultChecked={selectedAreas.includes(area)} /><span>{area}</span></label>)}</fieldset>
        </section>
        <footer className="partner-application__footer"><button className="partner-preview__primary" type="submit">Выбрать транспорт <ChevronRight /></button></footer>
      </form>
    );
  }

  return (
    <form className="partner-application__screen" onSubmit={submitTransport}>
      <FlowHeader title="Ваш транспорт" step={3} total={total} onBack={back} />
      <section className="partner-application__intro"><Bike /><span><strong>Как доставляете</strong><small>Укажите транспорт, который будете использовать.</small></span></section>
      <section className="partner-application__card">
        <label><span>Тип транспорта</span><select name="vehicleType" defaultValue="Легковой"><option>Легковой</option><option>Фургон</option><option>Мото</option><option>Велосипед</option><option>Пешком</option></select></label>
        <label><span>Марка</span><input name="vehicleBrand" placeholder="Lada" /></label>
        <label><span>Модель</span><input name="vehicleModel" placeholder="Granta" /></label>
        <div className="partner-application__plate-row"><label><span>Госномер</span><input name="carNumber" placeholder="А123ВС" maxLength={8} /></label><label><span>Регион</span><input name="carRegion" placeholder="95" inputMode="numeric" maxLength={3} /></label></div>
      </section>
      {error && <p className="partner-application__error" role="alert">{error}</p>}
      <footer className="partner-application__footer"><button className="partner-preview__primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Отправляем…' : 'Отправить заявку'} <ChevronRight /></button></footer>
    </form>
  );
}
