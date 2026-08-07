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
    const routeSource = readFileSync(resolve(repoRoot, 'src/PwaRoutes.tsx'), 'utf8');

    assert.match(apiSource, /publicPath:\s*`\/\$\{catalog\.slug\}`/);
    assert.doesNotMatch(apiSource, /publicPath:\s*`\/r\/\$\{catalog\.slug\}`/);
    assert.doesNotMatch(mockSource, /publicPath:\s*'\/r\//);
    assert.doesNotMatch(mainSource, /path="\/r\/:slug\/\*" element=\{<ClientPlatformApp \/>}/);
    assert.match(mainSource, /path="\/r\/:slug\/\*" element=\{<RestaurantRouteRedirect \/>}/);
    assert.match(routeSource, /function RestaurantRouteRedirect/);
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

  it('shows a newly submitted order as waiting for restaurant acceptance', () => {
    const appSource = readFileSync(resolve(repoRoot, 'src/pages/client-platform/ClientPlatformApp.tsx'), 'utf8');

    assert.match(appSource, /new:\s*'Ожидает принятия'/);
  });

  it('finalizes delivery price inside the protected creation RPC instead of an RLS-filtered browser update', () => {
    const apiSource = readFileSync(resolve(repoRoot, 'src/shared/api/clientPlatformApi.ts'), 'utf8');
    const migration = readFileSync(
      resolve(repoRoot, 'supabase/migrations/20260807150000_finalize_client_platform_order.sql'),
      'utf8'
    );

    assert.match(apiSource, /create_client_platform_restaurant_order/);
    assert.match(apiSource, /create_client_platform_legacy_restaurant_order/);
    assert.match(apiSource, /payment_method:\s*input\.draft\.paymentMethod/);
    assert.doesNotMatch(apiSource, /\.from\('orders'\)[\s\S]{0,80}\.update\(/);
    assert.match(migration, /resolved_delivery_fee := case[\s\S]*else 120/i);
    assert.match(migration, /total = subtotal \+ resolved_delivery_fee/i);
    assert.match(migration, /revoke all on function public\.finalize_created_client_platform_order\(uuid, text\)/i);
  });
});
