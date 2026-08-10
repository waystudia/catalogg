export const qualifiesForFreeDelivery = (subtotal: number, freeDeliveryFrom: number) => {
  const normalizedSubtotal = Math.max(0, subtotal);
  const normalizedThreshold = Math.max(0, freeDeliveryFrom);

  return normalizedThreshold > 0 && normalizedSubtotal >= normalizedThreshold;
};
