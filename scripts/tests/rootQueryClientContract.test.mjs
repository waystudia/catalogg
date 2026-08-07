import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8');

test('every routed screen can use React Query without crashing', () => {
  assert.match(mainSource, /import \{ QueryClient, QueryClientProvider \} from '@tanstack\/react-query'/);
  assert.match(mainSource, /const appQueryClient = new QueryClient\(/);
  assert.match(
    mainSource,
    /<QueryClientProvider client=\{appQueryClient\}>[\s\S]*<HashRouter>[\s\S]*<\/HashRouter>[\s\S]*<\/QueryClientProvider>/
  );
});
