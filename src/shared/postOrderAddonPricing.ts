export type PostOrderAddonFeeTier = {
  readonly id?: string;
  readonly maxExtraDistanceKm: number;
  readonly fee: number;
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizePostOrderAddonFeeTiers = (
  tiers: readonly PostOrderAddonFeeTier[],
): PostOrderAddonFeeTier[] =>
  tiers
    .map((tier) => ({
      ...(tier.id ? { id: tier.id } : {}),
      maxExtraDistanceKm: Math.max(
        0.1,
        Math.round(asNumber(tier.maxExtraDistanceKm) * 10) / 10,
      ),
      fee: Math.max(0, Math.round(asNumber(tier.fee))),
    }))
    .sort(
      (left, right) =>
        left.maxExtraDistanceKm - right.maxExtraDistanceKm,
    );
