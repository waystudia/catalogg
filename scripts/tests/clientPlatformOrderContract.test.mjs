import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('client platform restaurant order contract', () => {
  it('opens restaurant cards through editable catalog routes instead of the alternate /r UI', () => {
    const apiSource = readFileSync(resolve(repoRoot, 'src/shared/api/clientPlatformApi.ts'), 'utf8');
    const mockSource = readFileSync(resolve(repoRoot, 'src/features/client-platform/mockData.ts'), 'utf8');
    const mainSource = readFileSync(resolve(repoRoot, 'src/main.tsx'), 'utf8');

    assert.match(apiSource, /publicPath:\s*`\/\$\{catalog\.slug\}`/);
    assert.doesNotMatch(apiSource, /publicPath:\s*`\/r\/\$\{catalog\.slug\}`/);
    assert.doesNotMatch(mockSource, /publicPath:\s*'\/r\//);
    assert.doesNotMatch(mainSource, /path="\/r\/:slug\/\*" element=\{<ClientPlatformApp \/>}/);
    assert.match(mainSource, /function RestaurantRouteRedirect/);
  });

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
