const restaurantInitials: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Z', З: 'Z',
  И: 'I', Й: 'I', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'C', Ш: 'S', Щ: 'S',
  Ы: 'Y', Э: 'E', Ю: 'U', Я: 'Y'
};

export const getPublicOrderNumberPrefix = (restaurantNameOrSlug?: string | null) => {
  const first = restaurantNameOrSlug?.trim().charAt(0).toUpperCase() || 'W';
  return /^[A-Z]$/.test(first) ? first : restaurantInitials[first] ?? 'W';
};

export const getPublicOrderNumberSequence = (orderId: string) => {
  const hash = Array.from(orderId).reduce(
    (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
    7
  );
  return String((hash % 9999) + 1).padStart(4, '0');
};

export const formatPublicOrderNumber = (orderId: string, restaurantNameOrSlug?: string | null) =>
  `${getPublicOrderNumberPrefix(restaurantNameOrSlug)}${getPublicOrderNumberSequence(orderId)}`;
