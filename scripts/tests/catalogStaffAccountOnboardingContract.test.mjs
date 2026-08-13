import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260813010500_add_catalog_staff_account_onboarding.sql', import.meta.url),
  'utf8'
);
const edgeFunction = readFileSync(
  new URL('../../supabase/functions/create-catalog-staff/index.ts', import.meta.url),
  'utf8'
);

describe('catalog staff account onboarding', () => {
  it('checks tenant team-management access before privileged account creation', () => {
    assert.match(edgeFunction, /rpc\('can_manage_catalog_team'/);
    assert.match(migration, /is_catalog_member\([\s\S]*array\['owner', 'admin'\]/);
    assert.match(migration, /platform_admins/);
  });

  it('keeps Auth admin operations server-side and compensates failed new accounts', () => {
    assert.match(edgeFunction, /auth\.admin\.createUser/);
    assert.match(edgeFunction, /auth\.admin\.deleteUser\(createdUserId\)/);
    assert.match(edgeFunction, /link_catalog_staff_by_user_id/);
  });

  it('limits the linking RPC to service role and preserves catalog-scoped viewer membership', () => {
    assert.match(migration, /current_setting\('request\.jwt\.claim\.role'/);
    assert.match(migration, /'viewer'::public\.catalog_role/);
    assert.match(migration, /revoke all on function public\.link_catalog_staff_by_user_id[\s\S]*from public, anon, authenticated/i);
    assert.match(migration, /to service_role/);
  });
});
