import { describe, expect, it } from 'vitest';
import { mapOrderConversation } from '../../src/shared/api/orderConversationApi';

describe('order conversation payload', () => {
  it('maps immutable substitution snapshots and payment adjustments', () => {
    const result = mapOrderConversation({
      viewerKind: 'client',
      substitutions: [{
        id: 'sub-1',
        original_order_item_id: 'item-1',
        state: 'pending',
        original_title_snapshot: 'Молоко',
        original_line_total_snapshot: 120,
        proposed_title_snapshot: 'Финики',
        proposed_quantity: 500,
        proposed_quantity_unit_snapshot: 'gram',
        proposed_line_total: 200,
        price_delta: 80,
        note: 'Есть свежие',
        resolution_note: '',
        version: '2',
        proposed_at: '2026-08-12T10:00:00Z'
      }],
      messages: [{
        id: 'message-1',
        sender_kind: 'staff',
        message_type: 'text',
        body: 'Подойдёт эта замена?',
        substitution_request_id: 'sub-1',
        created_at: '2026-08-12T10:01:00Z'
      }],
      adjustments: [{
        id: 'adjustment-1',
        kind: 'additional_charge',
        amount_delta: '80',
        state: 'pending',
        created_at: '2026-08-12T10:02:00Z'
      }]
    });

    expect(result.viewerKind).toBe('client');
    expect(result.substitutions[0]).toMatchObject({
      originalTitle: 'Молоко',
      proposedTitle: 'Финики',
      priceDelta: 80,
      version: 2
    });
    expect(result.messages[0]).toMatchObject({ senderKind: 'staff', body: 'Подойдёт эта замена?' });
    expect(result.adjustments[0]).toMatchObject({ kind: 'additional_charge', amountDelta: 80 });
  });

  it('returns safe empty arrays for an incomplete payload', () => {
    expect(mapOrderConversation(null)).toEqual({
      viewerKind: 'staff',
      substitutions: [],
      messages: [],
      adjustments: []
    });
  });
});
