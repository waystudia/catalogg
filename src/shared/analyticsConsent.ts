import { legalDocumentReleases } from './legalDocuments';

export type CookieChoice = 'necessary' | 'analytics';

type ConsentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PublicAnalyticsEvent = {
  eventName: 'analytics_enabled' | 'page_view';
  route: string;
  sessionId: string;
};

type AnalyticsTrackerOptions = {
  storage: ConsentStorage;
  createSessionId: () => string;
  getRoute: () => string;
  record: (event: PublicAnalyticsEvent) => Promise<void>;
  withdraw: (sessionId: string) => Promise<void>;
  onChoice: (listener: (choice: CookieChoice) => void) => () => void;
  onNavigation: (listener: () => void) => () => void;
};

const COOKIE_POLICY_VERSION = legalDocumentReleases.cookie_policy.version;

export const COOKIE_CHOICE_KEY = `wayyaam:cookie-choice:${COOKIE_POLICY_VERSION}`;
export const ANALYTICS_SESSION_KEY = `wayyaam:analytics-session:${COOKIE_POLICY_VERSION}`;
export const COOKIE_CHOICE_EVENT = 'wayyaam:cookie-choice';

export const readCookieChoice = (storage: ConsentStorage): CookieChoice | null => {
  try {
    const stored = storage.getItem(COOKIE_CHOICE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { choice?: CookieChoice; version?: string };
    if (parsed.version !== COOKIE_POLICY_VERSION) return null;
    return parsed.choice === 'analytics' || parsed.choice === 'necessary' ? parsed.choice : null;
  } catch {
    return null;
  }
};

export const saveCookieChoice = (
  choice: CookieChoice,
  storage: ConsentStorage,
  now: () => Date = () => new Date()
) => {
  storage.setItem(COOKIE_CHOICE_KEY, JSON.stringify({
    choice,
    version: COOKIE_POLICY_VERSION,
    decidedAt: now().toISOString()
  }));
};

const routeGroups = new Map<string, string>([
  ['admin', '/admin'],
  ['business', '/business'],
  ['catalog', '/catalog'],
  ['checkout', '/checkout'],
  ['driver', '/driver'],
  ['login', '/login'],
  ['orders', '/orders'],
  ['pos', '/pos'],
  ['profile', '/profile'],
  ['restaurants', '/catalog']
]);

export const normalizeAnalyticsRoute = (pathname: string, hash = '') => {
  const rawHashPath = hash.startsWith('#') ? hash.slice(1) : hash;
  const source = rawHashPath.startsWith('/') ? rawHashPath : pathname;
  const firstSegment = source.split(/[/?#]/).filter(Boolean)[0]?.toLowerCase();

  if (!firstSegment) return '/catalog';
  const knownGroup = routeGroups.get(firstSegment);
  if (knownGroup) return knownGroup;
  if (rawHashPath.startsWith('/')) return '/catalog';
  return '/other';
};

const safelyRecord = (
  record: AnalyticsTrackerOptions['record'],
  event: PublicAnalyticsEvent
) => {
  void record(event).catch(() => undefined);
};

export const startConsentGatedAnalytics = (options: AnalyticsTrackerOptions) => {
  let active = readCookieChoice(options.storage) === 'analytics';
  let lastRoute: string | null = null;

  const clearSession = () => options.storage.removeItem(ANALYTICS_SESSION_KEY);
  const getSession = () => {
    const existing = options.storage.getItem(ANALYTICS_SESSION_KEY);
    if (existing) return existing;
    const created = options.createSessionId();
    options.storage.setItem(ANALYTICS_SESSION_KEY, created);
    return created;
  };
  const recordPageView = () => {
    if (!active) return;
    const route = normalizeAnalyticsRoute(options.getRoute());
    if (route === lastRoute) return;
    lastRoute = route;
    safelyRecord(options.record, { eventName: 'page_view', route, sessionId: getSession() });
  };
  const handleChoice = (choice: CookieChoice) => {
    if (choice === 'necessary') {
      active = false;
      lastRoute = null;
      const sessionId = options.storage.getItem(ANALYTICS_SESSION_KEY);
      if (sessionId) void options.withdraw(sessionId).catch(() => undefined);
      clearSession();
      return;
    }
    if (active) return;
    active = true;
    const route = normalizeAnalyticsRoute(options.getRoute());
    const sessionId = getSession();
    safelyRecord(options.record, { eventName: 'analytics_enabled', route, sessionId });
    lastRoute = null;
    recordPageView();
  };

  const unsubscribeChoice = options.onChoice(handleChoice);
  const unsubscribeNavigation = options.onNavigation(recordPageView);
  recordPageView();

  return () => {
    unsubscribeChoice();
    unsubscribeNavigation();
  };
};
