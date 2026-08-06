import type { ClientProfile } from '../../features/client-platform/types';
import { supabase } from '../supabase';
import { legalDocumentReleases } from '../legalDocuments';

const clientSessionStorageKey = 'waycatalog-client-session';

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
  return 'Не удалось связаться с сервисом аккаунтов. Попробуйте ещё раз.';
};

export const getStoredClientSessionToken = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(clientSessionStorageKey) ?? '';
};

export const hasStoredClientSession = () => Boolean(getStoredClientSessionToken());

const saveClientSessionToken = (token: string) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(clientSessionStorageKey, token);
};

const clearClientSessionToken = () => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(clientSessionStorageKey);
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
  const { data, error } = await supabase.rpc('register_client_account', {
    client_name: input.name.trim(),
    client_phone: input.phone.trim(),
    client_password: input.password
  });
  if (error) throw new Error(getRpcErrorMessage(error));
  const session = mapSession(data);
  const token = (data as ClientAccountRpcRow | null)?.session_token;
  if (!session || typeof token !== 'string') throw new Error('Не удалось создать клиентскую сессию.');
  saveClientSessionToken(token);
  await recordClientRegistrationLegalChoices(token, input);
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
  saveClientSessionToken(token);
  return session;
}

export async function loginCurrentAuthClientAccount() {
  if (!supabase) throw new Error('Сервис аккаунтов не настроен.');
  const { data, error } = await supabase.rpc('login_current_auth_client_account');
  if (error) throw new Error(getRpcErrorMessage(error));
  const session = mapSession(data);
  const token = (data as ClientAccountRpcRow | null)?.session_token;
  if (!session || typeof token !== 'string') throw new Error('Не удалось открыть клиентскую сессию.');
  saveClientSessionToken(token);
  return session;
}

export async function restoreClientAccountSession() {
  const token = getStoredClientSessionToken();
  if (!token || !supabase) return null;
  const { data, error } = await supabase.rpc('get_client_account_session', {
    client_session_token: token
  });
  if (error || !data) {
    clearClientSessionToken();
    return null;
  }
  return mapSession(data);
}

export async function logoutClientAccount() {
  const token = getStoredClientSessionToken();
  clearClientSessionToken();
  if (!token || !supabase) return;
  await supabase.rpc('logout_client_account', { client_session_token: token });
}
