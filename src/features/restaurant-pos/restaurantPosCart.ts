export type RestaurantPosCartItem = {
  productId: string;
  title: string;
  unitPrice: number;
  quantity: number;
};

export const addPosCartItem = (
  items: RestaurantPosCartItem[],
  item: RestaurantPosCartItem
): RestaurantPosCartItem[] => {
  const existing = items.find((current) => current.productId === item.productId);
  if (!existing) return [...items, { ...item, quantity: Math.max(1, item.quantity) }];
  return items.map((current) => current.productId === item.productId
    ? { ...current, quantity: current.quantity + Math.max(1, item.quantity) }
    : current);
};

export const changePosCartItemQuantity = (
  items: RestaurantPosCartItem[],
  productId: string,
  delta: number
): RestaurantPosCartItem[] => items.flatMap((item) => {
  if (item.productId !== productId) return [item];
  const quantity = item.quantity + delta;
  return quantity > 0 ? [{ ...item, quantity }] : [];
});

export const getPosCartItemsCount = (items: RestaurantPosCartItem[]) =>
  items.reduce((total, item) => total + item.quantity, 0);

export const getPosCartTotal = (items: RestaurantPosCartItem[]) =>
  items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
