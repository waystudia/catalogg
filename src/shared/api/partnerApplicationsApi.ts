import { supabase } from '../supabase';

export type PartnerApplicationKind = 'restaurant' | 'shop' | 'courier';

export type PartnerApplicationInput = {
  kind: PartnerApplicationKind;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string;
  details: Record<string, unknown>;
  acceptedTerms: boolean;
};

const partnerApplicationErrors: Record<string, string> = {
  invalid_application_kind: 'Выберите направление заявки.',
  invalid_applicant_name: 'Укажите имя и фамилию.',
  invalid_applicant_phone: 'Проверьте номер телефона.',
  invalid_applicant_email: 'Проверьте адрес электронной почты.',
  invalid_application_details: 'Проверьте данные заявки.',
  terms_are_required: 'Подтвердите согласие на обработку данных.'
};

export async function submitPartnerApplication(input: PartnerApplicationInput): Promise<string> {
  if (import.meta.env.MODE === 'test' || !supabase) return crypto.randomUUID();

  const { data, error } = await supabase.rpc('submit_partner_application', {
    p_application_kind: input.kind,
    p_applicant_name: input.applicantName,
    p_applicant_phone: input.applicantPhone,
    p_applicant_email: input.applicantEmail,
    p_details: input.details,
    p_accepted_terms: input.acceptedTerms
  });

  if (error) {
    const knownError = Object.entries(partnerApplicationErrors)
      .find(([code]) => error.message.includes(code));
    throw new Error(knownError?.[1] ?? 'Не удалось отправить заявку. Повторите ещё раз.');
  }

  if (typeof data !== 'string' || !data) {
    throw new Error('Не удалось получить номер заявки. Повторите ещё раз.');
  }

  return data;
}
