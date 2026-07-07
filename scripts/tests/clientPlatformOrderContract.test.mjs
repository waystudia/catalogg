import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('client platform restaurant order contract', () => {
  it('does not write catalog ids into the platform restaurant foreign key', () => {
    const apiSource = readFileSync(resolve(repoRoot, 'src/shared/api/clientPlatformApi.ts'), 'utf8');

    assert.doesNotMatch(apiSource, /restaurant_id:\s*input\.restaurant\.id/);
  });

  it('keeps /r/mangal populated from legacy catalog tables while platform tables are empty', () => {
    const apiSource = readFileSync(resolve(repoRoot, 'src/shared/api/clientPlatformApi.ts'), 'utf8');

    assert.match(apiSource, /catalog\.slug\s*===\s*'mangal'/);
    assert.match(apiSource, /\.from\('category'\)/);
    assert.match(apiSource, /\.from\('product'\)/);
  });
});
