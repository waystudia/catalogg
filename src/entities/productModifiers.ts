import type {
  CartItem,
  ProductModifierGroup,
  SelectedProductModifier
} from './models';

const nonNegativeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const normalizeProductModifierGroups = (value: unknown): ProductModifierGroup[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawGroup, groupIndex) => {
    if (!rawGroup || typeof rawGroup !== 'object') return [];
    const group = rawGroup as Partial<ProductModifierGroup>;
    const name = String(group.name ?? '').trim();
    if (!name || !Array.isArray(group.options)) return [];
    const options = group.options.flatMap((rawOption, optionIndex) => {
      if (!rawOption || typeof rawOption !== 'object') return [];
      const option = rawOption as ProductModifierGroup['options'][number];
      const optionName = String(option.name ?? '').trim();
      if (!optionName) return [];
      return [{
        id: String(option.id || `option-${optionIndex + 1}`),
        name: optionName,
        priceDelta: nonNegativeNumber(option.priceDelta),
        isDefault: option.isDefault === true,
        isActive: option.isActive !== false
      }];
    }).slice(0, 16);
    if (options.length === 0) return [];
    const maxSelected = Math.min(options.length, Math.max(1, Math.floor(nonNegativeNumber(group.maxSelected) || 1)));
    const required = group.required === true;
    return [{
      id: String(group.id || `group-${groupIndex + 1}`),
      name,
      required,
      minSelected: required ? Math.max(1, Math.min(maxSelected, Math.floor(nonNegativeNumber(group.minSelected) || 1))) : 0,
      maxSelected,
      isActive: group.isActive !== false,
      options
    }];
  }).slice(0, 8);
};

export const getSelectedModifierDetails = (item: CartItem) => {
  const groups = normalizeProductModifierGroups(item.product.modifier_groups);
  const selected = new Map((item.selected_modifiers ?? []).map((value) => [`${value.groupId}:${value.optionId}`, value]));
  return groups.flatMap((group) => group.options
    .filter((option) => selected.has(`${group.id}:${option.id}`))
    .map((option) => ({ group, option })));
};

export const getCartItemPrice = (item: CartItem) => {
  const variantPrice = (item.product.choice_options ?? [])
    .map((choice) => typeof choice === 'string' ? { name: choice, price: item.product.price } : choice)
    .find((choice) => choice.name.trim() === item.selected_choice)?.price ?? item.product.price;
  return getSelectedModifierDetails(item)
    .reduce((total, { option }) => total + option.priceDelta, variantPrice);
};

export const getCartItemTotal = (item: CartItem) => getCartItemPrice(item) * item.quantity;

export const buildCartLineId = (
  productId: string,
  selectedChoice?: string,
  selectedModifiers: SelectedProductModifier[] = []
) => {
  const modifiers = [...selectedModifiers]
    .sort((left, right) => `${left.groupId}:${left.optionId}`.localeCompare(`${right.groupId}:${right.optionId}`))
    .map((value) => `${value.groupId}:${value.optionId}`)
    .join('|');
  return [productId, selectedChoice?.trim() ?? '', modifiers].join('::');
};

export const getCartLineId = (item: CartItem) =>
  item.line_id || buildCartLineId(item.product.id, item.selected_choice, item.selected_modifiers);
