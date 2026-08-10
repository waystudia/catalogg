import { getStoredClientSessionToken, loginCurrentAuthClientAccount, type ClientAccountSession } from './clientAccountApi';
import { supabase } from '../supabase';

type BootstrapClientPasskeyResponse = {
  tokenHash?: unknown;
  error?: unknown;
};

export class ClientPasskeyError extends Error {
  constructor(message: string, readonly code = '') {
    super(message);
    this.name = 'ClientPasskeyError';
  }
}

const mapPasskeyError = (error: unknown) => {
  if (error instanceof ClientPasskeyError && [
    'client_session_missing',
    'service_missing',
    'unsupported',
    'bootstrap_failed'
  ].includes(error.code)) return error;
  const value = error && typeof error === 'object'
    ? error as { code?: unknown; name?: unknown; message?: unknown }
    : null;
  const code = `${String(value?.code ?? '')} ${String(value?.name ?? '')} ${String(value?.message ?? '')}`.toLowerCase();

  if (code.includes('passkey_disabled') || code.includes('404')) {
    return new ClientPasskeyError('Вход по Face ID пока не включён на сервере.', 'passkey_disabled');
  }
  if (code.includes('notallowederror') || code.includes('cancel') || code.includes('not allowed')) {
    return new ClientPasskeyError('Face ID отменён. Нажмите кнопку и подтвердите вход ещё раз.', 'cancelled');
  }
  if (code.includes('credential_not_found') || code.includes('no credentials') || code.includes('verification_failed')) {
    return new ClientPasskeyError('На этом iPhone ещё нет ключа WayYaam. Войдите паролем и включите Face ID в профиле.', 'not_found');
  }
  if (code.includes('credential_exists') || code.includes('already registered')) {
    return new ClientPasskeyError('Face ID уже подключён к этому профилю.', 'already_registered');
  }
  if (code.includes('client_account_not_linked')) {
    return new ClientPasskeyError('Этот ключ Face ID не относится к аккаунту клиента.', 'wrong_account');
  }
  if (code.includes('не относится к аккаунту клиента')) {
    return new ClientPasskeyError('Этот ключ Face ID не относится к аккаунту клиента.', 'wrong_account');
  }
  return new ClientPasskeyError('Не удалось использовать Face ID. Попробуйте ещё раз или войдите с паролем.', code);
};

export const clientPasskeyIsSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof window.PublicKeyCredential !== 'undefined' &&
  typeof navigator.credentials !== 'undefined';

export async function registerClientPasskey() {
  const clientSessionToken = getStoredClientSessionToken();
  if (!clientSessionToken) throw new ClientPasskeyError('Сначала войдите в аккаунт клиента.', 'client_session_missing');
  if (!supabase) throw new ClientPasskeyError('Сервис аккаунтов не настроен.', 'service_missing');
  if (!clientPasskeyIsSupported()) {
    throw new ClientPasskeyError('На этом устройстве вход по Face ID не поддерживается.', 'unsupported');
  }

  try {
    const { data: bootstrapData, error: bootstrapError } = await supabase.functions.invoke<BootstrapClientPasskeyResponse>(
      'bootstrap-client-passkey',
      { body: { clientSessionToken } }
    );
    if (bootstrapError) throw bootstrapError;
    if (typeof bootstrapData?.tokenHash !== 'string' || !bootstrapData.tokenHash) {
      throw new ClientPasskeyError('Сервер не подготовил вход по Face ID.', 'bootstrap_failed');
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: bootstrapData.tokenHash
    });
    if (verifyError) throw verifyError;

    const { data, error } = await supabase.auth.registerPasskey();
    if (error) throw error;
    return data;
  } catch (error) {
    throw mapPasskeyError(error);
  }
}

export async function signInClientWithPasskey(): Promise<ClientAccountSession> {
  if (!supabase) throw new ClientPasskeyError('Сервис аккаунтов не настроен.', 'service_missing');
  if (!clientPasskeyIsSupported()) {
    throw new ClientPasskeyError('На этом устройстве вход по Face ID не поддерживается.', 'unsupported');
  }

  try {
    const { error } = await supabase.auth.signInWithPasskey();
    if (error) throw error;
    return await loginCurrentAuthClientAccount();
  } catch (error) {
    const mapped = mapPasskeyError(error);
    if (mapped.code === 'wrong_account') {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    throw mapped;
  }
}
