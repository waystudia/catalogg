import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260815100523_post_order_addon_fee_tiers.sql",
);
const edge = read("supabase/functions/combined-order/index.ts");
const admin = read(
  "src/features/platform-admin-addons/PlatformAddonPricingSettings.tsx",
);
const api = read("src/shared/api/postOrderAddonPricingApi.ts");
const client = read(
  "src/features/combined-order/CombinedOrderAddonPanel.tsx",
);

describe("post-order addon pricing contract", () => {
  it("stores normalized fee tiers with safe RLS and initial 40/50/100 values", () => {
    assert.match(
      migration,
      /create table if not exists public\.post_order_addon_fee_tiers/i,
    );
    assert.match(migration, /1::numeric, 40::numeric/);
    assert.match(migration, /2::numeric, 50::numeric/);
    assert.match(migration, /3::numeric, 100::numeric/);
    assert.match(
      migration,
      /alter table public\.post_order_addon_fee_tiers enable row level security/i,
    );
    assert.match(migration, /using \(\(select public\.is_platform_admin\(\)\)\)/i);
  });

  it("lets only an authenticated platform admin replace tiers transactionally", () => {
    assert.match(
      migration,
      /create or replace function public\.save_post_order_addon_fee_tiers\(target_tiers jsonb\)/i,
    );
    assert.match(
      migration,
      /auth\.uid\(\) is null or not public\.is_platform_admin\(\)/i,
    );
    assert.match(migration, /delete from public\.post_order_addon_fee_tiers/i);
    assert.match(migration, /fee_tiers_do_not_cover_max_distance/i);
    assert.match(
      migration,
      /revoke all on function public\.save_post_order_addon_fee_tiers\(jsonb\) from public, anon, authenticated/i,
    );
    assert.match(
      migration,
      /grant execute on function public\.save_post_order_addon_fee_tiers\(jsonb\) to authenticated/i,
    );
  });

  it("calculates the quote fee on the server and confirms the snapshotted quote price", () => {
    assert.match(
      migration,
      /calculate_post_order_addon_fee\([\s\S]*?target_extra_distance_km <= tier\.max_extra_distance_km/i,
    );
    assert.match(
      migration,
      /set addon_delivery_fee = calculated_fee,[\s\S]*?total_amount = quote\.items_subtotal_amount \+ calculated_fee/i,
    );
    assert.match(
      migration,
      /set addon_delivery_fee = quote\.addon_delivery_fee[\s\S]*?confirm_post_order_addon_flat_fee_legacy/i,
    );
    assert.doesNotMatch(edge, /payload\.(?:addonDeliveryFee|fee)/);
  });

  it("returns exact merchant fees and shows the final server quote before confirmation", () => {
    assert.match(edge, /addonFeeForDistance/);
    assert.match(edge, /addonDeliveryFee: addon_delivery_fee/);
    assert.match(client, /merchant\.addonDeliveryFee/);
    assert.match(client, /quote\.addonDeliveryFee/);
    assert.match(client, /от \+\$\{formatPrice\(offer\.addonDeliveryFee\)\}/);
  });

  it("provides a mobile superadmin editor with add, remove, validation and save", () => {
    assert.match(admin, /Дополнительная остановка/);
    assert.match(admin, /Добавить/);
    assert.match(admin, /Удалить тариф/);
    assert.match(admin, /Сохранить тарифы/);
    assert.match(api, /save_post_order_addon_fee_tiers/);
    assert.match(api, /post_order_addon_fee_tiers/);
  });
});
