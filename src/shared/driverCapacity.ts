export const normalizeDriverCapacity = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(1, Math.trunc(parsed)));
};

export const driverHasCapacity = (activeDeliveries: number, maxActiveDeliveries: number) =>
  Math.max(0, activeDeliveries) < normalizeDriverCapacity(maxActiveDeliveries);
