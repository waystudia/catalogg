import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('client platform restaurant order contract', () => {
  it('keeps every business card on the shared editable public catalog route', () => {
    const apiSource = readFileSync(resolve(repoRoot, 'src/shared/api/clientPlatformApi.ts'), 'utf8');
    const mockSource = readFileSync(resolve(repoRoot, 'src/features/client-platform/mockData.ts'), 'utf8');
    const mainSource = readFileSync(resolve(repoRoot, 'src/main.tsx'), 'utf8');
    const routeSource = readFileSync(resolve(repoRoot, 'src/PwaRoutes.tsx'), 'utf8');

    assert.match(apiSource, /publicPath: `\/\$\{catalog\.slug\}`/);
    assert.doesNotMatch(mockSource, /publicPath:\s*'\/r\//);
    assert.doesNotMatch(mainSource, /path="\/r\/:slug\/\*" element=\{<ClientPlatformApp \/>}/);
    assert.match(mainSource, /path="\/r\/:slug\/\*" element=\{<RestaurantRouteRedirect \/>}/);
    assert.match(mainSource, /path="\/business\/:slug\/\*" element=\{<BusinessAdminRoute \/>}/);
    assert.match(routeSource, /function RestaurantRouteRedirect\(\)[\s\S]*return <Navigate replace to=/);
    assert.match(
      routeSource,
      /function BusinessAdminRoute\(\)[\s\S]*return <CatalogAdminApp slug=\{decodeURIComponent\(slug\)\} routePath=\{routePath\} \/>/
    );
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

  it('keeps universal weighted fields when the shared catalog loads grocery products', () => {
    const catalogSource = readFileSync(resolve(repoRoot, 'src/shared/supabase.ts'), 'utf8');
    const orderSource = readFileSync(resolve(repoRoot, 'src/shared/api/restaurantOrderPayload.ts'), 'utf8');

    assert.match(catalogSource, /value\.sale_unit === 'weight'[\s\S]*minimum_weight:/);
    assert.doesNotMatch(
      catalogSource.match(/const mapPlatformProduct[\s\S]*?const mapPlatformCabin/)?.[0] ?? '',
      /value\.sale_unit === 'weight'[\s\S]*pricing_type: 'per_kg'/
    );
    assert.match(orderSource, /requested_quantity:[\s\S]*normalizeSelectedWeight/);
    assert.match(orderSource, /create_secure_client_platform_order/);
  });

  it('shows a newly submitted order as waiting for restaurant acceptance', () => {
    const appSource = readFileSync(resolve(repoRoot, 'src/pages/client-platform/ClientPlatformApp.tsx'), 'utf8');

    assert.match(appSource, /new:\s*'Ожидает принятия'/);
  });

  it('finalizes delivery price inside the protected creation RPC instead of an RLS-filtered browser update', () => {
    const apiSource = readFileSync(resolve(repoRoot, 'src/shared/api/clientPlatformApi.ts'), 'utf8');
    const orderPayloadSource = readFileSync(
      resolve(repoRoot, 'src/shared/api/clientPlatformOrderPayload.ts'),
      'utf8'
    );
    const migration = readFileSync(
      resolve(repoRoot, 'supabase/migrations/20260807150000_finalize_client_platform_order.sql'),
      'utf8'
    );

    assert.match(orderPayloadSource, /create_secure_client_platform_order/);
    assert.match(apiSource, /create_secure_client_platform_order/);
    assert.match(apiSource, /payment_method:\s*input\.draft\.paymentMethod/);
    assert.doesNotMatch(apiSource, /\.from\('orders'\)[\s\S]{0,80}\.update\(/);
    assert.match(migration, /resolved_delivery_fee := case[\s\S]*else 120/i);
    assert.match(migration, /total = subtotal \+ resolved_delivery_fee/i);
    assert.match(migration, /revoke all on function public\.finalize_created_client_platform_order\(uuid, text\)/i);
  });
});
