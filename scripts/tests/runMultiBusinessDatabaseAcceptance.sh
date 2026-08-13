#!/usr/bin/env bash

set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

psql --set ON_ERROR_STOP=1 \
  --file scripts/tests/sql/multi_business_pre_migration_fixture.sql

if [[ "${WAYYAAM_APPLY_MULTI_BUSINESS_MIGRATION:-0}" == "1" ]]; then
  psql --set ON_ERROR_STOP=1 \
    --file supabase/migrations/20260812172641_add_multi_business_foundation.sql
  psql --set ON_ERROR_STOP=1 \
    --file supabase/migrations/20260812211500_add_catalog_sale_units.sql
  if [[ -f supabase/migrations/20260812223500_add_catalog_staff_workflow.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260812223500_add_catalog_staff_workflow.sql
  fi
  if [[ -f supabase/migrations/20260812235500_add_grocery_picking_substitutions.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260812235500_add_grocery_picking_substitutions.sql
  fi
  if [[ -f supabase/migrations/20260812235900_add_white_label_storefronts.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260812235900_add_white_label_storefronts.sql
  fi
  if [[ -f supabase/migrations/20260813000500_manage_white_label_storefronts.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260813000500_manage_white_label_storefronts.sql
  fi
  if [[ -f supabase/migrations/20260813000600_weighted_order_variant_pricing_compatibility.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260813000600_weighted_order_variant_pricing_compatibility.sql
  fi
  if [[ -f supabase/migrations/20260813004827_reserve_wayyaam_github_pages_hostname.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260813004827_reserve_wayyaam_github_pages_hostname.sql
  fi
  # The checkout, cancellation, template seed and hydration migrations depend on
  # the complete production commerce schema. They are covered by source
  # contracts and the full-schema transactional validation, not this deliberately
  # minimal multi-business fixture (which must keep the grocery template empty).
  if [[ -f supabase/migrations/20260813010400_reconcile_grocery_picking_stock.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260813010400_reconcile_grocery_picking_stock.sql
  fi
  if [[ -f supabase/migrations/20260813010500_add_catalog_staff_account_onboarding.sql ]]; then
    psql --set ON_ERROR_STOP=1 \
      --file supabase/migrations/20260813010500_add_catalog_staff_account_onboarding.sql
  fi
fi

psql --set ON_ERROR_STOP=1 \
  --file scripts/tests/sql/multi_business_foundation_acceptance.sql

psql --set ON_ERROR_STOP=1 \
  --file scripts/tests/sql/catalog_sale_foundation_acceptance.sql

psql --set ON_ERROR_STOP=1 \
  --file scripts/tests/sql/catalog_staff_workflow_acceptance.sql

psql --set ON_ERROR_STOP=1 \
  --file scripts/tests/sql/grocery_substitution_workflow_acceptance.sql

psql --set ON_ERROR_STOP=1 \
  --file scripts/tests/sql/white_label_storefront_acceptance.sql
