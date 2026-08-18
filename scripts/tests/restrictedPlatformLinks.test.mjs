import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const publicAndSettingsSources = [
  'src/app/App.tsx',
  'src/pages/client-platform/ClientPlatformApp.tsx',
  'src/features/design-settings/DesignEditor.tsx',
  'src/features/restaurant-settings/ProfileSettings.tsx',
  'src/data/catalog.ts',
  'supabase/schema.sql'
].map(read).join('\n');

test('public and restaurant settings surfaces do not promote restricted social platforms', () => {
  assert.doesNotMatch(publicAndSettingsSources, /instagram\.com|facebook\.com|fb\.com/i);
  assert.doesNotMatch(publicAndSettingsSources, />\s*(Instagram|Facebook)\s*</i);
  assert.doesNotMatch(publicAndSettingsSources, /<Instagram\b|<Facebook\b/i);
});
