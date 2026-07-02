import { z } from 'zod';

const transliteration: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya'
};

export function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[а-яё]/g, (char) => transliteration[char] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function isStrongPassword(value: string) {
  return (
    value.length >= 10 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[!@#$%&*+\-_]/.test(value)
  );
}

const pickSecureChar = (characters: string) => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return characters[bytes[0] % characters.length];
};

export function generateSecurePassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*+-_';
  const all = upper + lower + numbers + symbols;
  const safeLength = Math.max(length, 10);
  const chars = [
    pickSecureChar(upper),
    pickSecureChar(lower),
    pickSecureChar(numbers),
    pickSecureChar(symbols)
  ];

  while (chars.length < safeLength) {
    chars.push(pickSecureChar(all));
  }

  const order = new Uint32Array(chars.length);
  crypto.getRandomValues(order);
  return chars
    .map((char, index) => ({ char, rank: order[index] }))
    .sort((left, right) => left.rank - right.rank)
    .map((item) => item.char)
    .join('');
}

export const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Минимум 2 символа').max(100, 'Максимум 100 символов'),
  slug: z
    .string()
    .trim()
    .min(3, 'Минимум 3 символа')
    .max(63, 'Максимум 63 символа')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Только латиница, цифры и дефис внутри строки'),
  ownerName: z.string().trim().max(100, 'Максимум 100 символов').optional(),
  email: z.string().trim().toLowerCase().email('Введите корректный email'),
  phone: z.string().trim().max(30, 'Максимум 30 символов').optional(),
  primaryCity: z.string().trim().max(120, 'Максимум 120 символов').optional(),
  serviceSettlementsText: z.string().trim().max(1500, 'Слишком длинный список').optional(),
  password: z.string().refine(isStrongPassword, 'Минимум 10 символов: A-z, цифра и спецсимвол'),
  templateVersionId: z.string().uuid('Выберите шаблон'),
  businessType: z.string().min(2, 'Выберите тип бизнеса'),
  planId: z.string().optional(),
  subscriptionEndsAt: z.string().optional(),
  status: z.enum(['active', 'inactive', 'blocked', 'pending']).default('active'),
  subscriptionStatus: z.enum(['trial', 'active', 'past_due', 'expired', 'cancelled']).default('trial'),
  sendEmail: z.boolean().default(false),
  adminConsentConfirmed: z.boolean().refine(Boolean, 'Необходимо подтвердить согласие клиента')
});

export type CreateClientFormValues = z.infer<typeof createClientSchema>;
