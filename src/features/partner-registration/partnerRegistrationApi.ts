import { supabase } from '../../shared/supabase';
import { getPartnerRegistrationErrorMessage } from './partnerRegistrationErrors';

export type PartnerRole = 'seller' | 'driver';

export type PartnerRegistrationPayload = {
  role: PartnerRole;
  name: string;
  phone: string;
  email: string;
  password: string;
  businessType?: string;
  businessName?: string;
  primaryCity?: string;
  serviceSettlements?: string[];
  residencePlace?: string;
  transportType?: 'car' | 'van' | 'motorcycle';
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  carNumber?: string;
};

export type PartnerRegistrationResult = {
  registration: {
    role: PartnerRole;
    subject_id: string;
    catalog_slug?: string;
    review_state: string;
    demo_expires_at?: string;
  };
  session: { access_token: string; refresh_token: string };
};

export async function registerPartner(payload: PartnerRegistrationPayload): Promise<PartnerRegistrationResult> {
  if (!supabase) throw new Error('Сервис регистрации не настроен.');
  const { data, error } = await supabase.functions.invoke<PartnerRegistrationResult>('register-partner', {
    body: payload
  });
  if (error || !data) throw new Error(await getPartnerRegistrationErrorMessage(error));
  const sessionResult = await supabase.auth.setSession(data.session);
  if (sessionResult.error) throw new Error('Заявка создана, но не удалось выполнить вход. Войдите через почту и пароль.');
  return data;
}

export async function saveSellerApplication(input: { organizationType: string; legalName: string; inn: string; ogrn: string; legalAddress: string; actualAddress: string; representativeName: string; authorityBasis: string }) {
  if (!supabase) throw new Error('Сервис регистрации не настроен.');
  const { error } = await supabase.rpc('save_current_seller_legal_profile', { requested_profile: {
    organization_type: input.organizationType, legal_name: input.legalName, inn: input.inn,
    ogrn: input.ogrn, legal_address: input.legalAddress, actual_address: input.actualAddress,
    representative_full_name: input.representativeName, authority_basis: input.authorityBasis
  } });
  if (error) throw new Error(error.message.includes('inn_invalid') ? 'Введите ИНН из 10 или 12 цифр.' : 'Не удалось сохранить реквизиты.');
}

export async function uploadSellerDocument(file: File, documentType: string) {
  if (!supabase) throw new Error('Сервис регистрации не настроен.');
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Разрешены JPG, PNG и PDF размером до 10 МБ.');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Войдите в аккаунт продавца.');
  const { data: client, error: clientError } = await supabase.from('clients').select('id').eq('owner_user_id', auth.user.id).single();
  if (clientError || !client) throw new Error('Заявка продавца не найдена.');
  const safeName = file.name.replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]+/g, '-');
  const storagePath = `${auth.user.id}/${client.id}/${crypto.randomUUID()}-${safeName}`;
  const upload = await supabase.storage.from('partner-documents').upload(storagePath, file, { contentType: file.type });
  if (upload.error) throw new Error('Не удалось загрузить документ.');
  const metadata = await supabase.from('partner_documents').insert({ owner_user_id: auth.user.id, subject_type: 'seller', subject_id: client.id, document_type: documentType, storage_path: storagePath, file_name: file.name, mime_type: file.type, file_size: file.size });
  if (metadata.error) { await supabase.storage.from('partner-documents').remove([storagePath]); throw new Error('Не удалось сохранить документ.'); }
}

export async function submitSellerApplication() {
  if (!supabase) throw new Error('Сервис регистрации не настроен.');
  const { error } = await supabase.rpc('submit_current_seller_application');
  if (error) throw new Error('Не удалось отправить заявку на проверку.');
}
