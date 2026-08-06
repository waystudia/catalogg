export type PasswordCredentials =
  | { email: string; password: string }
  | { phone: string; password: string };

export const normalizeLoginPhone = (value: string) => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error('Введите корректный телефон или email.');
};

export const buildPasswordCredentials = (identifier: string, password: string): PasswordCredentials => {
  const normalized = identifier.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { email: normalized.toLowerCase(), password };
  }
  return { phone: normalizeLoginPhone(normalized), password };
};
