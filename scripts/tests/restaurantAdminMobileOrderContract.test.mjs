import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const adminWorkspaceSource = readFileSync(
  resolve(repoRoot, 'src/features/restaurant-admin/RestaurantAdminWorkspace.tsx'),
  'utf8'
);

describe('restaurant admin mobile order details', () => {
  it('opens an order through a handler that scrolls details into view', () => {
    assert.match(adminWorkspaceSource, /const openOrderFromList = \(order: RestaurantOrder\) => \{/);
    assert.match(adminWorkspaceSource, /setSelectedOrder\(order\)/);
    assert.match(adminWorkspaceSource, /querySelector\('\.admin-order-details-panel'\)/);
    assert.match(adminWorkspaceSource, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
    assert.match(adminWorkspaceSource, /onClick=\{\(\) => openOrderFromList\(order\)\}/);
  });
});
