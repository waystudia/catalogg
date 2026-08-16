const errorMessage = (message: string) => {
  if (/already|registered|exists|duplicate/i.test(message)) return 'Аккаунт с таким телефоном или почтой уже существует.';
  if (message.includes('phone_invalid')) return 'Введите корректный номер телефона.';
  if (message.includes('email_invalid')) return 'Введите корректную почту.';
  if (message.includes('password_invalid')) return 'Пароль должен содержать от 8 до 72 символов.';
  if (message.includes('name_invalid')) return 'Введите имя и фамилию.';
  if (message.includes('business_name_required')) return 'Введите название бизнеса.';
  if (message.includes('driver_geography_required')) return 'Укажите место проживания и основной город работы.';
  if (message.includes('service_not_configured')) return 'Сервис регистрации временно недоступен. Попробуйте позже.';
  if (message.includes('business_template_unavailable')) return 'Для этого типа бизнеса пока не настроен шаблон.';
  return 'Не удалось отправить заявку. Проверьте данные и попробуйте ещё раз.';
};

export async function getPartnerRegistrationErrorMessage(error: unknown) {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const body = await context.clone().json() as { error?: unknown };
      if (typeof body.error === 'string') return errorMessage(body.error);
    } catch {
      // Fall back to the SDK message when the response body is not JSON.
    }
  }
  return errorMessage(error instanceof Error ? error.message : 'registration_failed');
}
