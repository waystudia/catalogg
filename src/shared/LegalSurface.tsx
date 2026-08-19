import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { legalDocuments } from './legalDocuments';
import {
  COOKIE_CHOICE_EVENT,
  readCookieChoice,
  saveCookieChoice,
  type CookieChoice
} from './analyticsConsent';

export function LegalSurface() {
  const { pathname } = useLocation();
  const isRestaurantPos = /\/pos\/?$/.test(pathname);
  const [cookieChoice, setCookieChoice] = useState<CookieChoice | null>(() => readCookieChoice(window.localStorage));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(cookieChoice === 'analytics');

  const choose = (choice: CookieChoice) => {
    try {
      saveCookieChoice(choice, window.localStorage);
    } catch {
      // The visible choice still applies for this tab when browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent<CookieChoice>(COOKIE_CHOICE_EVENT, { detail: choice }));
    setCookieChoice(choice);
    setAnalyticsEnabled(choice === 'analytics');
    setSettingsOpen(false);
  };

  const openSettings = () => {
    setAnalyticsEnabled(cookieChoice === 'analytics');
    setSettingsOpen(true);
  };

  return (
    <>
      {!isRestaurantPos && (
        <footer className="legal-footer" aria-label="Юридическая информация">
          <span>© {new Date().getFullYear()} WayYaam</span>
          <a href={legalDocuments.policy} target="_blank" rel="noreferrer">Персональные данные</a>
          <a href={legalDocuments.agreement} target="_blank" rel="noreferrer">Соглашение</a>
          <a href={legalDocuments.cookies} target="_blank" rel="noreferrer">Cookies</a>
          <a href={legalDocuments.index} target="_blank" rel="noreferrer">Все документы</a>
          <button type="button" onClick={openSettings}>Настройки cookies</button>
        </footer>
      )}
      {cookieChoice === null && !settingsOpen && (
        <section className="cookie-consent cookie-consent--prompt" role="dialog" aria-label="Настройки cookies" aria-live="polite">
          <div className="cookie-consent__copy">
            <strong>Помочь улучшать WayYaam?</strong>
            <span>Только анонимные просмотры разделов, без данных заказа. </span>
            <a href={legalDocuments.cookies} target="_blank" rel="noreferrer">Подробнее</a>
          </div>
          <div className="cookie-consent__actions">
            <button type="button" onClick={() => choose('necessary')}>Нет, спасибо</button>
            <button className="is-primary" type="button" onClick={() => choose('analytics')}>Разрешить</button>
          </div>
        </section>
      )}
      {settingsOpen && (
        <section className="cookie-consent cookie-consent--settings" role="dialog" aria-label="Настройки cookies" aria-live="polite">
          <header className="cookie-consent__settings-header">
            <div>
              <strong>Настройки cookies</strong>
              <span>Необходимые технологии всегда включены.</span>
            </div>
            <button type="button" className="cookie-consent__close" aria-label="Закрыть настройки" onClick={() => setSettingsOpen(false)}>×</button>
          </header>
          <label className="cookie-consent__toggle">
            <span>
              <strong>Анонимная аналитика</strong>
              <small>Просмотры разделов для улучшения сервиса</small>
            </span>
            <input
              type="checkbox"
              checked={analyticsEnabled}
              onChange={(event) => setAnalyticsEnabled(event.target.checked)}
            />
          </label>
          <div className="cookie-consent__settings-actions">
            <a href={legalDocuments.cookies} target="_blank" rel="noreferrer">Политика cookies</a>
            <button className="is-primary" type="button" onClick={() => choose(analyticsEnabled ? 'analytics' : 'necessary')}>Сохранить выбор</button>
          </div>
        </section>
      )}
    </>
  );
}
