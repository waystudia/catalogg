import { supabase } from "../supabase";
import {
  normalizePostOrderAddonFeeTiers,
  type PostOrderAddonFeeTier,
} from "../postOrderAddonPricing";

export type { PostOrderAddonFeeTier } from "../postOrderAddonPricing";

export type PostOrderAddonPricingSettings = {
  readonly maxExtraDistanceKm: number;
  readonly tiers: readonly PostOrderAddonFeeTier[];
};

const defaultSettings: PostOrderAddonPricingSettings = {
  maxExtraDistanceKm: 3,
  tiers: [
    { maxExtraDistanceKm: 1, fee: 40 },
    { maxExtraDistanceKm: 2, fee: 50 },
    { maxExtraDistanceKm: 3, fee: 100 },
  ],
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function getPostOrderAddonPricingSettings(): Promise<PostOrderAddonPricingSettings> {
  if (!supabase) return defaultSettings;
  const [configResult, tiersResult] = await Promise.all([
    supabase
      .from("post_order_addon_config")
      .select("max_extra_distance_km")
      .eq("id", "global")
      .single(),
    supabase
      .from("post_order_addon_fee_tiers")
      .select("id, max_extra_distance_km, fee")
      .eq("config_id", "global")
      .order("max_extra_distance_km", { ascending: true }),
  ]);
  if (configResult.error) throw configResult.error;
  if (tiersResult.error) throw tiersResult.error;

  return {
    maxExtraDistanceKm: asNumber(
      configResult.data?.max_extra_distance_km,
      defaultSettings.maxExtraDistanceKm,
    ),
    tiers: normalizePostOrderAddonFeeTiers(
      (tiersResult.data ?? []).map((tier) => ({
        id: String(tier.id),
        maxExtraDistanceKm: asNumber(tier.max_extra_distance_km),
        fee: asNumber(tier.fee),
      })),
    ),
  };
}

export async function savePostOrderAddonFeeTiers(
  tiers: readonly PostOrderAddonFeeTier[],
): Promise<PostOrderAddonPricingSettings> {
  const normalized = normalizePostOrderAddonFeeTiers(tiers);
  if (!supabase) {
    return { ...defaultSettings, tiers: normalized };
  }
  const { error } = await supabase.rpc("save_post_order_addon_fee_tiers", {
    target_tiers: normalized.map(({ maxExtraDistanceKm, fee }) => ({
      maxExtraDistanceKm,
      fee,
    })),
  });
  if (error) throw error;
  return getPostOrderAddonPricingSettings();
}
