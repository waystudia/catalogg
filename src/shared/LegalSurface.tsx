import { useState } from 'react';
import { legalDocumentReleases, legalDocuments } from './legalDocuments';

const COOKIE_POLICY_VERSION = legalDocumentReleases.cookie_policy.version;
const COOKIE_CHOICE_KEY = `wayyaam:cookie-choice:${COOKIE_POLICY_VERSION}`;

type CookieChoice = 'necessary' | 'analytics';

const saveCookieChoice = (choice: CookieChoice) => {
  window.localStorage.setItem(COOKIE_CHOICE_KEY, JSON.stringify({ choice, version: COOKIE_POLICY_VERSION, decidedAt: new Date().toISOString() }));
  window.dispatchEvent(new CustomEvent('wayyaam:cookie-choice', { detail: choice }));
};

export function LegalSurface() {
  const [cookieChoice, setCookieChoice] = useState<CookieChoice | null>(() => {
    try {
      const stored = window.localStorage.getItem(COOKIE_CHOICE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as { choice?: CookieChoice };
      return parsed.choice === 'analytics' ? 'analytics' : parsed.choice === 'necessary' ? 'necessary' : null;
    } catch {
      return null;
    }
  });

  const choose = (choice: CookieChoice) => {
    saveCookieChoice(choice);
    setCookieChoice(choice);
  };

  return (
    <>
      <footer className="legal-footer" aria-label="Юридическая информация">
        <span>© {new Date().getFullYear()} WayYaam</span>
        <a href={legalDocuments.policy} target="_blank" rel="noreferrer">Персональные данные</a>
        <a href={legalDocuments.agreement} target="_blank" rel="noreferrer">Соглашение</a>
        <a href={legalDocuments.cookies} target="_blank" rel="noreferrer">Cookies</a>
        <a href={legalDocuments.index} target="_blank" rel="noreferrer">Все документы</a>
        <button type="button" onClick={() => setCookieChoice(null)}>Настройки cookies</button>
      </footer>
      {cookieChoice === null && (
        <section className="cookie-consent" role="dialog" aria-label="Настройки cookies" aria-live="polite">
          <p>
            Мы используем необходимые технологии для входа, корзины и PWA. Аналитика выключена,
            пока вы её не разрешите. <a href={legalDocuments.cookies} target="_blank" rel="noreferrer">Подробнее</a>
          </p>
          <div>
            <button type="button" onClick={() => choose('necessary')}>Только необходимые</button>
            <button className="is-primary" type="button" onClick={() => choose('analytics')}>Разрешить аналитику</button>
          </div>
        </section>
      )}
    </>
  );
}
