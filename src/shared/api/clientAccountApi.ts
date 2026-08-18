import type { ClientAddress, ClientProfile } from '../../features/client-platform/types';
import { supabase } from '../supabase';
import { legalDocumentReleases } from '../legalDocuments';
import {
  clientOrderCredentialKeys,
  getGuestOrderTrackingToken,
  getStoredClientSessionToken,
  saveGuestOrderTrackingToken
} from './clientOrderCredentials';

const clientSessionStorageKey = clientOrderCredentialKeys.session;
const clientSessionSnapshotStorageKey = 'waycatalog-client-session-profile';

export { getGuestOrderTrackingToken, getStoredClientSessionToken, saveGuestOrderTrackingToken };

export class ClientSessionRestorationUnavailableError extends Error {
  constructor() {
    super('Не удалось проверить вход. Повторяем автоматически.');
    this.name = 'ClientSessionRestorationUnavailableError';
  }
}

export type ClientAccountSession = ClientProfile & {
  accountId: string;
  expiresAt: string;
};

type ClientAccountRpcRow = {
  account_id?: unknown;
  name?: unknown;
  phone?: unknown;
  session_token?: unknown;
  expires_at?: unknown;
};

type ClientBrowserPairingRpcRow = {
  pairing_code?: unknown;
  expires_at?: unknown;
};

export type ClientBrowserPairingCode = {
  code: string;
  expiresAt: string;
};

const mapSession = (value: unknown): ClientAccountSession | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as ClientAccountRpcRow;
  if (typeof row.account_id !== 'string' || typeof row.name !== 'string' || typeof row.phone !== 'string') {
    return null;
  }
  return {
    accountId: row.account_id,
    name: row.name,
    phone: row.phone,
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : ''
  };
};

const getRpcErrorMessage = (error: { message?: string } | null) => {
  const message = error?.message ?? '';
  if (message.includes('client_phone_registered')) return 'Аккаунт с этим номером уже существует. Нажмите «Войти».';
  if (message.includes('client_credentials_invalid')) return 'Неверный номер телефона или пароль.';
  if (message.includes('client_name_invalid')) return 'Введите имя — минимум 2 символа.';
  if (message.includes('client_phone_invalid')) return 'Введите корректный номер телефона.';
  if (message.includes('client_password_invalid')) return 'Пароль должен содержать от 6 до 72 символов.';
  if (message.includes('required_client_legal_acceptance_missing')) return 'Подтвердите пользовательское соглашение и согласие на обработку данных отдельно.';
  if (message.includes('client_session_invalid')) return 'Вход в PWA больше не действует. Войдите снова.';
  if (message.includes('client_account_not_linked')) return 'Этот ключ Face ID не относится к аккаунту клиента.';
  if (message.includes('client_pairing_code_invalid')) return 'Код неверный, уже использован или истёк. Создайте новый код в PWA.';
  return 'Не удалось связаться с сервисом аккаунтов. Попробуйте ещё раз.';
};

export const hasStoredClientSession = () => Boolean(getStoredClientSessionToken());

export type CurrentClientLegalState = {
  registered: boolean;
  userAgreementCurrent: boolean;
  clientConsentCurrent: boolean;
};

export async function getCurrentClientLegalState(): Promise<CurrentClientLegalState> {
  if (!supabase) return { registered: false, userAgreementCurrent: false, clientConsentCurrent: false };
  const agreement = legalDocumentReleases.user_agreement;
  const consent = legalDocumentReleases.client_consent;
  const { data, error } = await supabase.rpc('get_current_client_legal_state', {
    client_session_token: getStoredClientSessionToken() || null,
    target_user_agreement_version: agreement.version,
    target_user_agreement_sha256: agreement.sha256,
    target_client_consent_version: consent.version,
    target_client_consent_sha256: consent.sha256
  });
  if (error || !data || typeof data !== 'object') {
    return { registered: false, userAgreementCurrent: false, clientConsentCurrent: false };
  }
  const row = data as Record<string, unknown>;
  return {
    registered: row.registered === true,
    userAgreementCurrent: row.user_agreement_current === true,
    clientConsentCurrent: row.client_consent_current === true
  };
}

const readClientSessionSnapshot = (): ClientAccountSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(clientSessionSnapshotStorageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ClientAccountSession>;
    if (
      typeof value.accountId !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.phone !== 'string'
    ) {
      return null;
    }
    return {
      accountId: value.accountId,
      name: value.name,
      phone: value.phone,
      expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : ''
    };
  } catch {
    return null;
  }
};

const saveClientSession = (token: string, session: ClientAccountSession) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(clientSessionStorageKey, token);
  window.localStorage.setItem(clientSessionSnapshotStorageKey, JSON.stringify(session));
};

const clearClientSession = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(clientSessionStorageKey);
  window.localStorage.removeItem(clientSessionSnapshotStorageKey);
};

export const buildClientAuthPath = (returnTo: string) =>
  `/profile?clientAuth=1&returnTo=${encodeURIComponent(returnTo)}`;

type ClientRegistrationLegalChoices = {
  acceptedAgreement: boolean;
  acceptedPersonalData: boolean;
  acceptedAdvertising: boolean;
};

export const recordClientRegistrationLegalChoices = async (token: string, choices: ClientRegistrationLegalChoices) => {
  if (!supabase) return;
  const records = [
    ['user_agreement', choices.acceptedAgreement],
    ['client_consent', choices.acceptedPersonalData],
    ['advertising_consent', choices.acceptedAdvertising]
  ] as const;
  for (const [code, granted] of records) {
    const release = legalDocumentReleases[code];
    const { error } = await supabase.rpc('record_client_legal_consent', {
      client_session_token: token,
      target_document_code: code,
      target_document_version: release.version,
      target_document_sha256: release.sha256,
      target_granted: granted,
      target_source: 'client_registration'
    });
    if (error) throw new Error('Не удалось сохранить подтверждение условий. Проверьте интернет и попробуйте ещё раз.');
  }
};

export async function registerClientAccount(input: ClientProfile & { password: string } & ClientRegistrationLegalChoices) {
  if (!supabase) throw new Error('Сервис аккаунтов не настроен.');
  const { data, error } = await supabase.rpc('register_client_account_with_legal', {
    client_name: input.name.trim(),
    client_phone: input.phone.trim(),
    client_password: input.password,
    accepted_user_agreement: input.acceptedAgreement,
    user_agreement_version: legalDocumentReleases.user_agreement.version,
    user_agreement_sha256: legalDocumentReleases.user_agreement.sha256,
    accepted_client_consent: input.acceptedPersonalData,
    client_consent_version: legalDocumentReleases.client_consent.version,
    client_consent_sha256: legalDocumentReleases.client_consent.sha256,
    accepted_advertising: input.acceptedAdvertising,
    advertising_version: legalDocumentReleases.advertising_consent.version,
    advertising_sha256: legalDocumentReleases.advertising_consent.sha256
  });
  if (error) throw new Error(getRpcErrorMessage(error));
  const session = mapSession(data);
  const token = (data as ClientAccountRpcRow | null)?.session_token;
  if (!session || typeof token !== 'string') throw new Error('Не удалось создать клиентскую сессию.');
  saveClientSession(token, session);
  return session;
}

export async function loginClientAccount(input: { phone: string; password: string }) {
  if (!supabase) throw new Error('Сервис аккаунтов не настроен.');
  const { data, error } = await supabase.rpc('login_client_account', {
    client_phone: input.phone.trim(),
    client_password: input.password
  });
  if (error) throw new Error(getRpcErrorMessage(error));
  const session = mapSession(data);
  const token = (data as ClientAccountRpcRow | null)?.session_token;
  if (!session || typeof token !== 'string') throw new Error('Не удалось открыть клиентскую сессию.');
  saveClientSession(token, session);
  return session;
}

export async function loginCurrentAuthClientAccount() {
  if (!supabase) throw new Error('Сервис аккаунтов не настроен.');
  const { data, error } = await supabase.rpc('login_current_auth_client_account');
  if (error) throw new Error(getRpcErrorMessage(error));
  const session = mapSession(data);
  const token = (data as ClientAccountRpcRow | null)?.session_token;
  if (!session || typeof token !== 'string') throw new Error('Не удалось открыть клиентскую сессию.');
  saveClientSession(token, session);
  return session;
}

const restoreClientAccountFromAuthSession = async () => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ClientSessionRestorationUnavailableError();
  if (!data.session) return null;
  try {
    return await loginCurrentAuthClientAccount();
  } catch (error) {
    if (error instanceof Error && /не относится к аккаунту клиента/i.test(error.message)) return null;
    throw new ClientSessionRestorationUnavailableError();
  }
};

export async function restoreClientAccountSession() {
  const token = getStoredClientSessionToken();
  if (!supabase) return null;
  if (!token) return restoreClientAccountFromAuthSession();
  const { data, error } = await supabase.rpc('get_client_account_session', {
    client_session_token: token
  });
  if (error) {
    const snapshot = readClientSessionSnapshot();
    if (snapshot) return snapshot;
    throw new ClientSessionRestorationUnavailableError();
  }
  if (!data) {
    clearClientSession();
    return restoreClientAccountFromAuthSession();
  }
  const session = mapSession(data);
  if (!session) {
    clearClientSession();
    return restoreClientAccountFromAuthSession();
  }
  saveClientSession(token, session);
  return session;
}

export async function createClientBrowserPairingCode(): Promise<ClientBrowserPairingCode> {
  const token = getStoredClientSessionToken();
  if (!token) throw new Error('Сначала войдите в аккаунт клиента в PWA.');
  if (!supabase) throw new Error('Сервис аккаунтов не настроен.');

  const { data, error } = await supabase.rpc('create_client_browser_pairing_code', {
    client_session_token: token
  });
  if (error) throw new Error(getRpcErrorMessage(error));

  const row = data as ClientBrowserPairingRpcRow | null;
  if (typeof row?.pairing_code !== 'string' || typeof row.expires_at !== 'string') {
    throw new Error('Не удалось создать код сопряжения.');
  }

  return {
    code: row.pairing_code,
    expiresAt: row.expires_at
  };
}

export async function redeemClientBrowserPairingCode(code: string): Promise<ClientAccountSession> {
  if (!supabase) throw new Error('Сервис аккаунтов не настроен.');

  const { data, error } = await supabase.rpc('redeem_client_browser_pairing_code', {
    pairing_code: code
  });
  if (error) throw new Error(getRpcErrorMessage(error));

  const session = mapSession(data);
  const token = (data as ClientAccountRpcRow | null)?.session_token;
  if (!session || typeof token !== 'string') {
    throw new Error('Не удалось связать профиль с браузером.');
  }

  saveClientSession(token, session);
  return session;
}

export async function getCurrentClientAddresses(): Promise<ClientAddress[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('client_addresses')
    .select('id, title, address_line, lat, lng, accuracy_m, entrance, floor, apartment, intercom_code, landmark, comment, is_default')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{
      id: row.id,
      title: row.title || 'Адрес доставки',
      addressLine: row.address_line,
      lat,
      lng,
      accuracyM: row.accuracy_m == null ? null : Number(row.accuracy_m),
      entrance: row.entrance ?? '',
      floor: row.floor ?? '',
      apartment: row.apartment ?? '',
      intercomCode: row.intercom_code ?? '',
      landmark: row.landmark ?? '',
      comment: row.comment ?? '',
      isDefault: row.is_default === true
    }];
  });
}

export async function logoutClientAccount() {
  const token = getStoredClientSessionToken();
  clearClientSession();
  if (!token || !supabase) return;
  await supabase.rpc('logout_client_account', { client_session_token: token });
}
