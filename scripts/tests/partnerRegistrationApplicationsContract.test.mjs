import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const intakeMigration = readFileSync(
  new URL('../../supabase/migrations/20261029211205_harden_partner_registration_intake.sql', import.meta.url),
  'utf8'
);
const flowSource = readFileSync(
  new URL('../../src/features/partner-registration-preview/PartnerApplicationFlow.tsx', import.meta.url),
  'utf8'
);
const apiSource = readFileSync(
  new URL('../../src/shared/api/partnerApplicationsApi.ts', import.meta.url),
  'utf8'
);

describe('partner application intake', () => {
  it('accepts public applications through RLS without elevated function privileges', () => {
    assert.match(intakeMigration, /security invoker/i);
    assert.match(intakeMigration, /for insert[\s\S]*to anon, authenticated/i);
    assert.match(intakeMigration, /status = 'pending'/);
    assert.match(intakeMigration, /accepted_terms_at between/);
    assert.doesNotMatch(intakeMigration, /security definer/i);
  });

  it('submits the live form to Supabase and renders a real application number', () => {
    assert.match(apiSource, /supabase\.rpc\('submit_partner_application'/);
    assert.match(flowSource, /Заявка отправлена/);
    assert.match(flowSource, /applicationId\.slice/);
    assert.doesNotMatch(flowSource, /Демо-режим/);
    assert.doesNotMatch(flowSource, /name="password"/);
  });
});
