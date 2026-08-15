import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260815115618_settlement_delivery_tariff_matrix.sql',
  import.meta.url
);

const sql = await readFile(migrationUrl, 'utf8');

const quotedPairs = [
  ['Цоци-Юрт', 'Гелдаган', 300],
  ['Цоци-Юрт', 'Автуры', 500],
  ['Цоци-Юрт', 'Курчалой', 500],
  ['Цоци-Юрт', 'Мескер-Юрт', 400],
  ['Гелдаган', 'Курчалой', 400],
  ['Гелдаган', 'Автуры', 500],
  ['Гелдаган', 'Мескер-Юрт', 400]
];

const calculatedPairs = [
  ['Автуры', 'Курчалой', 500],
  ['Автуры', 'Мескер-Юрт', 600],
  ['Курчалой', 'Мескер-Юрт', 600]
];

test('seeds every quoted route in both directions without changing the agreed price', () => {
  for (const [from, to, amount] of quotedPairs) {
    assert.match(sql, new RegExp(`\\('${from}', '${to}', ${amount}`));
    assert.match(sql, new RegExp(`\\('${to}', '${from}', ${amount}`));
  }
});

test('seeds the calculated missing routes in both directions', () => {
  for (const [from, to, amount] of calculatedPairs) {
    assert.match(sql, new RegExp(`\\('${from}', '${to}', ${amount}`));
    assert.match(sql, new RegExp(`\\('${to}', '${from}', ${amount}`));
  }
});

test('uses the 200 RUB same-settlement rule for all five settlements', () => {
  for (const settlement of ['Цоци-Юрт', 'Гелдаган', 'Автуры', 'Курчалой', 'Мескер-Юрт']) {
    assert.match(sql, new RegExp(`\\('${settlement}', '${settlement}', 200`));
  }
});

test('keeps route pricing server-authoritative during order finalization', () => {
  assert.match(sql, /get_delivery_route_price/);
  assert.match(sql, /resolved_delivery_fee := case/);
  assert.match(sql, /subtotal \+ resolved_delivery_fee/);
  assert.match(sql, /status::text not in \('new', 'waiting_payment_confirmation'\)/);
  assert.match(sql, /revoke all on function public\.finalize_created_client_platform_order/);
});
