import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manual branch checks build without attempting a protected Pages deployment', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const deploy = workflow.split('\n  deploy:\n')[1];
  assert.match(deploy, /(?:^|\n)    if: github\.ref == 'refs\/heads\/main'\n/);
  assert.match(deploy, /\n    needs: build\n/);
  assert.match(workflow, /\n  workflow_dispatch:/);
});
