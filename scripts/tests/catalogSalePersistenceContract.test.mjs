import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'src/shared/supabase.ts'), 'utf8');

describe('catalog sale persistence adapter', () => {
  it('reads normalized sale and inventory columns from platform products', () => {
    assert.match(
      source,
      /select\('id, category_id,[^']*title, status, price,[^']*sku, barcode, sale_unit, quantity_unit, price_basis_quantity, minimum_quantity, quantity_step, stock_quantity, allow_substitution[^']*'\)/
    );
  });

  it('writes normalized sale fields instead of hiding them only in custom_fields', () => {
    for (const mapping of [
      /sku: product\.sku/,
      /barcode: product\.barcode/,
      /sale_unit: product\.sale_unit/,
      /quantity_unit: product\.quantity_unit/,
      /price_basis_quantity: product\.price_basis_quantity/,
      /minimum_quantity: product\.minimum_quantity/,
      /quantity_step: product\.quantity_step/,
      /stock_quantity: product\.stock_quantity/,
      /allow_substitution: product\.allow_substitution/
    ]) {
      assert.match(source, mapping);
    }
  });

  it('allows stock and sale configuration to be updated through the same catalog adapter', () => {
    assert.match(source, /if \(patch\.stock_quantity !== undefined\) row\.stock_quantity = patch\.stock_quantity/);
    assert.match(source, /if \(patch\.sale_unit !== undefined\) row\.sale_unit = patch\.sale_unit/);
    assert.match(source, /if \(patch\.allow_substitution !== undefined\) row\.allow_substitution = patch\.allow_substitution/);
  });
});
