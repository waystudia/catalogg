import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const adminSource = fs.readFileSync(new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../../src/shared/api/platformReviewsApi.ts', import.meta.url), 'utf8');
const migrations = fs.readdirSync(new URL('../../supabase/migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_allow_platform_admin_review_deletion.sql'));
const migrationSource = migrationName
  ? fs.readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')
  : '';

test('super admin navigation exposes restaurant and driver review moderation', () => {
  assert.match(adminSource, /\| 'reviews'/);
  assert.match(adminSource, /route: 'reviews', label: 'Отзывы'/);
  assert.match(adminSource, /route === 'reviews'/);
});

test('review deletion verifies the affected row and stays protected by platform-admin RLS', () => {
  assert.match(apiSource, /\.from\('client_reviews'\)[\s\S]*\.delete\(\)[\s\S]*\.eq\('id', reviewId\)[\s\S]*\.select\('id'\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(apiSource, /if \(!data\)[\s\S]*throw new Error/);
  assert.match(migrationSource, /grant delete on table public\.client_reviews to authenticated/i);
  assert.match(migrationSource, /revoke delete on table public\.client_reviews from anon/i);
  assert.match(migrationSource, /for delete[\s\S]*using \(\(select public\.is_platform_admin\(\)\)\)/i);
});
