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
fi

psql --set ON_ERROR_STOP=1 \
  --file scripts/tests/sql/multi_business_foundation_acceptance.sql
