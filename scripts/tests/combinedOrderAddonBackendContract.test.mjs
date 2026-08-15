import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName = readdirSync(
  resolve(repoRoot, "supabase/migrations"),
).find((name) => name.endsWith("_combined_order_addon_backend.sql"));
const migration = migrationName
  ? readFileSync(
      resolve(repoRoot, "supabase/migrations", migrationName),
      "utf8",
    )
  : "";
const edgePath = resolve(
  repoRoot,
  "supabase/functions/combined-order/index.ts",
);
const edge = (() => {
  try {
    return readFileSync(edgePath, "utf8");
  } catch {
    return "";
  }
})();

describe("combined-order addon backend contract", () => {
  it("cheaply prefilters candidates and rate-limits expensive route work", () => {
    assert.ok(
      migrationName,
      "combined-order addon backend migration must exist",
    );
    assert.match(
      migration,
      /create or replace function public\.get_post_order_addon_context\(/i,
    );
    assert.match(
      migration,
      /client_account_sessions[\s\S]*?extensions\.digest/i,
    );
    assert.match(migration, /wayyaam_point_to_segment_km/i);
    assert.match(migration, /max_route_candidates/i);
    assert.match(
      migration,
      /create table if not exists public\.combined_order_request_log/i,
    );
    assert.match(
      migration,
      /request_type in \('offer', 'view', 'quote', 'confirm'\)/i,
    );
    assert.match(
      migration,
      /quote_rate_limit_per_minute|confirm_rate_limit_per_minute/i,
    );
  });

  it("records one offer view and does not duplicate availability notifications on refresh", () => {
    assert.match(
      edge,
      /type Action = ["']offer["'] \| ["']view["'] \| ["']quote["'] \| ["']confirm["']/,
    );
    assert.match(edge, /ADDON_OFFER_VIEWED/);
    assert.match(edge, /context\.offer\.status === ["']evaluating["']/);
    assert.match(edge, /eventResult\.error/);
    assert.match(edge, /notificationResult\.error/);
  });

  it("uses one route matrix request and applies server-side detour and hot-food limits", () => {
    assert.match(edge, /\/table\/v1\/driving\//);
    assert.match(edge, /calculateMerchantRouteEligibility/);
    assert.match(edge, /maxExtraDistanceKm/);
    assert.match(edge, /maxPostMainPickupDelayMinutes/);
    assert.doesNotMatch(edge, /isFortyRubleDelivery/);
  });

  it("creates quotes from live products and never accepts client-provided totals", () => {
    assert.match(edge, /from\(["']products["']\)/);
    assert.match(edge, /stock_quantity/);
    assert.match(edge, /create_post_order_addon_quote/);
    assert.doesNotMatch(
      edge,
      /payload\.(?:total|itemsSubtotal|addonDeliveryFee)/,
    );
    assert.match(migration, /quote_token_digest/i);
  });

  it("confirms idempotently as a second merchant order attached to one delivery", () => {
    assert.match(
      migration,
      /create or replace function public\.confirm_post_order_addon\(/i,
    );
    assert.match(migration, /for update/i);
    assert.match(migration, /\bsource\b/i);
    assert.match(migration, /'post_order_addon'/i);
    assert.match(migration, /is_addon/i);
    assert.match(migration, /insert into public\.order_items/i);
    assert.match(migration, /stock_quantity = remaining_stock/i);
    assert.match(
      migration,
      /existing_order\.order_group_id = order_group\.id[\s\S]*?existing_order\.idempotency_key/i,
    );
    assert.match(migration, /insert into public\.deliveries/i);
    assert.match(migration, /insert into public\.delivery_stops/i);
    assert.match(migration, /'ADDON_CREATED'/i);
    assert.match(migration, /'ROUTE_CALCULATED'/i);
  });

  it("keeps direct client access closed while the Edge function revalidates before confirm", () => {
    assert.match(
      migration,
      /revoke all on function public\.confirm_post_order_addon[\s\S]*?from public, anon, authenticated/i,
    );
    assert.match(
      migration,
      /grant execute on function public\.confirm_post_order_addon[\s\S]*?to service_role/i,
    );
    assert.match(edge, /action === ["']confirm["']/);
    assert.match(edge, /loadOfferContext/);
    assert.match(edge, /calculateRoutes/);
    assert.match(edge, /rpc\(["']confirm_post_order_addon["']/);
  });

  it("exposes only a token-owned grouped summary and linked-client realtime policies", () => {
    assert.match(
      migration,
      /create or replace function public\.get_client_combined_order_summary/i,
    );
    assert.match(
      migration,
      /public\.is_order_group_client\(target_group\.id, client_session_token\)/i,
    );
    assert.match(migration, /order groups linked clients read/i);
    assert.match(migration, /delivery stops linked clients read/i);
    assert.match(migration, /auth_user_id = \(select auth\.uid\(\)\)/i);
  });
});
