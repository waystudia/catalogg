const sessionStorageKey = 'wayyaam:commercial-attribution-session:v1';

export const getCommercialAttributionSessionId = () => {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(sessionStorageKey);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = window.crypto?.randomUUID?.();
    if (!created) return null;
    window.localStorage.setItem(sessionStorageKey, created);
    return created;
  } catch {
    return null;
  }
};
