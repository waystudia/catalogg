export type PublicClientProfile = {
  name: string;
  phone: string;
  deliveryCity: string;
  deliverySettlement: string;
  deliveryAddress: string;
};

export type SettlementRequest = {
  id: string;
  cityName: string;
  settlementName: string;
  source: string;
  count: number;
  status: 'new' | 'approved' | 'dismissed';
  createdAt: string;
  lastSeenAt: string;
};

export type SettlementRequestInput = {
  cityName: string;
  settlementName: string;
  source: string;
};

export const settlementRequestsStorageKey = 'waycatalog:settlement-requests';
export const clientPlatformStorageKey = 'waycatalog-client-platform';

const profileStorageKey = (slug: string) => `waycatalog:${slug}:public-client-profile`;

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ');

export const normalizeRussianClientPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const nationalDigits = (digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits).slice(0, 10);

  return [
    '+7',
    nationalDigits.length ? ` (${nationalDigits.slice(0, 3)}` : '',
    nationalDigits.length >= 3 ? ')' : '',
    nationalDigits.length > 3 ? ` ${nationalDigits.slice(3, 6)}` : '',
    nationalDigits.length > 6 ? `-${nationalDigits.slice(6, 8)}` : '',
    nationalDigits.length > 8 ? `-${nationalDigits.slice(8, 10)}` : ''
  ].join('');
};

export const isValidRussianClientPhone = (value: string) =>
  value.replace(/\D/g, '').length === 11 &&
  value.startsWith('+7') &&
  normalizeRussianClientPhone(value) === value;

const titleCaseWord = (word: string) =>
  word ? `${word[0].toLocaleUpperCase('ru-RU')}${word.slice(1).toLocaleLowerCase('ru-RU')}` : word;

const titleCaseHyphenatedWord = (word: string) => word.split('-').map(titleCaseWord).join('-');

export const normalizeSettlementName = (value: string) =>
  normalizeText(value)
    .split(' ')
    .map(titleCaseHyphenatedWord)
    .join(' ');

const normalizeCityName = normalizeSettlementName;

const isProfile = (value: unknown): value is PublicClientProfile => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['name', 'phone', 'deliveryCity', 'deliverySettlement', 'deliveryAddress'].every(
    (key) => typeof candidate[key] === 'string'
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stringFromRecord = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === 'string' ? record[key] : '';

const readJson = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const loadPublicClientProfile = (slug: string, storage: Storage = localStorage): PublicClientProfile | null => {
  try {
    const stored = storage.getItem(profileStorageKey(slug));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const mergeProfiles = (...profiles: Array<PublicClientProfile | null>): PublicClientProfile | null => {
  const merged = profiles.reduce<PublicClientProfile>(
    (current, profile) => ({
      name: profile?.name || current.name,
      phone: profile?.phone || current.phone,
      deliveryCity: profile?.deliveryCity || current.deliveryCity,
      deliverySettlement: profile?.deliverySettlement || current.deliverySettlement,
      deliveryAddress: profile?.deliveryAddress || current.deliveryAddress
    }),
    { name: '', phone: '', deliveryCity: '', deliverySettlement: '', deliveryAddress: '' }
  );

  return Object.values(merged).some(Boolean) ? merged : null;
};

export const loadClientPlatformProfile = (
  slug: string,
  storage: Storage = localStorage
): PublicClientProfile | null => {
  const stored = readJson(storage.getItem(clientPlatformStorageKey));
  if (!isRecord(stored)) return null;

  const state = isRecord(stored.state) ? stored.state : stored;
  const profile = isRecord(state.profile) ? state.profile : {};
  const drafts = isRecord(state.checkoutDrafts) ? state.checkoutDrafts : {};
  const draft = isRecord(drafts[slug]) ? drafts[slug] : {};
  const addresses = Array.isArray(state.addresses) ? state.addresses.filter(isRecord) : [];
  const draftAddressId = stringFromRecord(draft, 'addressId');
  const selectedAddress =
    addresses.find((address) => stringFromRecord(address, 'id') === draftAddressId) ??
    addresses.find((address) => address.isDefault === true) ??
    addresses[0];

  const nextProfile: PublicClientProfile = {
    name: normalizeText(stringFromRecord(draft, 'clientName') || stringFromRecord(profile, 'name')),
    phone: normalizeText(stringFromRecord(draft, 'clientPhone') || stringFromRecord(profile, 'phone')),
    deliveryCity: '',
    deliverySettlement: '',
    deliveryAddress: normalizeText(
      stringFromRecord(draft, 'deliveryAddress') || (selectedAddress ? stringFromRecord(selectedAddress, 'addressLine') : '')
    )
  };

  return Object.values(nextProfile).some(Boolean) ? nextProfile : null;
};

export const loadPublicClientCheckoutProfile = (
  slug: string,
  storage: Storage = localStorage
): PublicClientProfile | null =>
  mergeProfiles(loadClientPlatformProfile(slug, storage), loadPublicClientProfile(slug, storage));

const saveClientPlatformProfile = (profile: PublicClientProfile, storage: Storage) => {
  const stored = readJson(storage.getItem(clientPlatformStorageKey));
  const container = isRecord(stored) ? stored : {};
  const state = isRecord(container.state) ? container.state : isRecord(stored) ? stored : {};
  const currentProfile = isRecord(state.profile) ? state.profile : {};
  const nextProfile = {
    ...currentProfile,
    name: profile.name || stringFromRecord(currentProfile, 'name'),
    phone: profile.phone || stringFromRecord(currentProfile, 'phone')
  };
  const nextState = { ...state, profile: nextProfile };
  const nextContainer = isRecord(container.state) ? { ...container, state: nextState } : nextState;

  storage.setItem(clientPlatformStorageKey, JSON.stringify(nextContainer));
};

export const savePublicClientProfile = (
  slug: string,
  profile: PublicClientProfile,
  storage: Storage = localStorage
) => {
  const nextProfile: PublicClientProfile = {
    name: normalizeText(profile.name),
    phone: normalizeText(profile.phone),
    deliveryCity: normalizeCityName(profile.deliveryCity),
    deliverySettlement: normalizeSettlementName(profile.deliverySettlement),
    deliveryAddress: normalizeText(profile.deliveryAddress)
  };

  storage.setItem(profileStorageKey(slug), JSON.stringify(nextProfile));
  saveClientPlatformProfile(nextProfile, storage);
  return nextProfile;
};

const isSettlementRequest = (value: unknown): value is SettlementRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.cityName === 'string' &&
    typeof candidate.settlementName === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.count === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.lastSeenAt === 'string'
  );
};

export const readLocalSettlementRequests = (storage: Storage = localStorage): SettlementRequest[] => {
  try {
    const stored = storage.getItem(settlementRequestsStorageKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isSettlementRequest) : [];
  } catch {
    return [];
  }
};

export const saveLocalSettlementRequest = (
  input: SettlementRequestInput,
  storage: Storage = localStorage,
  now = new Date()
) => {
  const cityName = normalizeCityName(input.cityName);
  const settlementName = normalizeSettlementName(input.settlementName);
  if (!settlementName) return null;

  const current = readLocalSettlementRequests(storage);
  const requestKey = `${cityName.toLocaleLowerCase('ru-RU')}|${settlementName.toLocaleLowerCase('ru-RU')}`;
  const existing = current.find(
    (request) =>
      `${request.cityName.toLocaleLowerCase('ru-RU')}|${request.settlementName.toLocaleLowerCase('ru-RU')}` ===
      requestKey
  );

  const timestamp = now.toISOString();
  const nextRequest: SettlementRequest = existing
    ? {
        ...existing,
        count: existing.count + 1,
        lastSeenAt: timestamp
      }
    : {
        id: `settlement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        cityName,
        settlementName,
        source: input.source,
        count: 1,
        status: 'new',
        createdAt: timestamp,
        lastSeenAt: timestamp
      };

  const nextRequests = existing
    ? current.map((request) => (request.id === existing.id ? nextRequest : request))
    : [nextRequest, ...current];

  storage.setItem(settlementRequestsStorageKey, JSON.stringify(nextRequests));
  return nextRequest;
};
