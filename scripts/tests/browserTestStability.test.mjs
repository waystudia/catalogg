import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vitestConfig = await readFile(new URL('../../vitest.config.ts', import.meta.url), 'utf8');

test('the browser suite prebundles React DOM so GitHub CI cannot reload midway through a run', () => {
  assert.match(
    vitestConfig,
    /optimizeDeps:\s*\{[\s\S]*include:\s*\[[\s\S]*['"]react-dom\/client['"][\s\S]*\]/
  );
  assert.match(
    vitestConfig,
    /extends:\s*true[\s\S]*name:\s*['"]browser['"]/
  );
});
