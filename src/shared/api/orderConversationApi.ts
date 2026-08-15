import type { PickingLineState, SubstitutionDecision } from '../../entities/orderSubstitution';
import { supabase } from '../supabase';
import { getStoredClientSessionToken } from './clientAccountApi';

export type OrderSubstitutionState = SubstitutionDecision | 'pending' | 'cancelled';

export type OrderConversationViewer = 'client' | 'staff' | 'driver';

export type OrderSubstitutionRequest = {
  id: string;
  originalOrderItemId: string;
  state: OrderSubstitutionState;
  originalTitle: string;
  originalLineTotal: number;
  proposedTitle: string;
  proposedQuantity: number;
  proposedQuantityUnit: string;
  proposedLineTotal: number;
  priceDelta: number;
  note: string;
  resolutionNote: string;
  version: number;
  proposedAt: string;
};

export type OrderMessage = {
  id: string;
  senderKind: OrderConversationViewer | 'system';
  messageType: 'text' | 'substitution_offer' | 'substitution_decision' | 'picking_event' | 'status_event';
  body: string;
  substitutionRequestId: string | null;
  createdAt: string;
};

export type OrderPaymentAdjustment = {
  id: string;
  kind: 'additional_charge' | 'refund';
  amountDelta: number;
  state: 'pending' | 'settled' | 'cancelled';
  createdAt: string;
};

export type OrderConversation = {
  viewerKind: OrderConversationViewer;
  substitutions: OrderSubstitutionRequest[];
  messages: OrderMessage[];
  adjustments: OrderPaymentAdjustment[];
};

type ConversationPayload = {
  viewerKind?: unknown;
  substitutions?: unknown;
  messages?: unknown;
  adjustments?: unknown;
};

type JsonRow = Record<string, unknown>;

const rows = (value: unknown): JsonRow[] => Array.isArray(value)
  ? value.filter((item): item is JsonRow => Boolean(item) && typeof item === 'object')
  : [];
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const emptyOrderConversation = (viewerKind: OrderConversationViewer): OrderConversation => ({
  viewerKind,
  substitutions: [],
  messages: [],
  adjustments: []
});

export const mapOrderConversation = (value: unknown): OrderConversation => {
  const payload = (value && typeof value === 'object' ? value : {}) as ConversationPayload;
  return {
    viewerKind: payload.viewerKind === 'client' || payload.viewerKind === 'driver' ? payload.viewerKind : 'staff',
    substitutions: rows(payload.substitutions).map((row) => ({
      id: text(row.id),
      originalOrderItemId: text(row.original_order_item_id),
      state: text(row.state, 'pending') as OrderSubstitutionState,
      originalTitle: text(row.original_title_snapshot),
      originalLineTotal: number(row.original_line_total_snapshot),
      proposedTitle: text(row.proposed_title_snapshot),
      proposedQuantity: number(row.proposed_quantity),
      proposedQuantityUnit: text(row.proposed_quantity_unit_snapshot, 'piece'),
      proposedLineTotal: number(row.proposed_line_total),
      priceDelta: number(row.price_delta),
      note: text(row.note),
      resolutionNote: text(row.resolution_note),
      version: number(row.version),
      proposedAt: text(row.proposed_at)
    })),
    messages: rows(payload.messages).map((row) => ({
      id: text(row.id),
      senderKind: text(row.sender_kind, 'system') as OrderMessage['senderKind'],
      messageType: text(row.message_type, 'text') as OrderMessage['messageType'],
      body: text(row.body),
      substitutionRequestId: text(row.substitution_request_id) || null,
      createdAt: text(row.created_at)
    })),
    adjustments: rows(payload.adjustments).map((row) => ({
      id: text(row.id),
      kind: text(row.kind, 'additional_charge') as OrderPaymentAdjustment['kind'],
      amountDelta: number(row.amount_delta),
      state: text(row.state, 'pending') as OrderPaymentAdjustment['state'],
      createdAt: text(row.created_at)
    }))
  };
};

export async function getOrderConversation(
  orderId: string,
  catalogId: string,
  viewer: OrderConversationViewer = 'staff'
) {
  if (!supabase) return emptyOrderConversation(viewer);
  const { data, error } = viewer === 'driver'
    ? await supabase.rpc('get_driver_order_conversation', {
        target_order_id: orderId,
        target_catalog_id: catalogId
      })
    : await supabase.rpc('get_order_conversation', {
        target_order_id: orderId,
        target_catalog_id: catalogId,
        client_session_token: viewer === 'client' ? getStoredClientSessionToken() : null
      });
  if (error) throw new Error(error.message);
  return mapOrderConversation(data);
}

export async function markCatalogOrderItemPicked(orderItemId: string, fulfilledQuantity?: number) {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc('mark_catalog_order_item_picked', {
    target_order_item_id: orderItemId,
    target_fulfilled_quantity: fulfilledQuantity ?? null
  });
  if (error) throw new Error(error.message);
  return number(data);
}

export type CatalogOrderItemScanResult = {
  fulfilledQuantity: number;
  requestedQuantity: number;
  state: 'pending' | 'picked';
};

export async function scanCatalogOrderItem(orderItemId: string): Promise<CatalogOrderItemScanResult> {
  if (!supabase) return { fulfilledQuantity: 1, requestedQuantity: 1, state: 'picked' };
  const { data, error } = await supabase.rpc('scan_catalog_order_item', {
    target_order_item_id: orderItemId
  });
  if (error) throw new Error(error.message);
  const result = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    fulfilledQuantity: number(result.fulfilled_quantity),
    requestedQuantity: number(result.requested_quantity),
    state: result.state === 'picked' ? 'picked' : 'pending'
  };
}

export async function proposeCatalogOrderSubstitution(input: {
  orderItemId: string;
  proposedProductId: string;
  proposedVariantId?: string | null;
  proposedQuantity?: number;
  note?: string;
}) {
  if (!supabase) return crypto.randomUUID();
  const { data, error } = await supabase.rpc('propose_catalog_order_substitution', {
    target_order_item_id: input.orderItemId,
    target_proposed_product_id: input.proposedProductId,
    target_proposed_variant_id: input.proposedVariantId ?? null,
    target_proposed_quantity: input.proposedQuantity ?? null,
    target_note: input.note?.trim() ?? ''
  });
  if (error) throw new Error(error.message);
  return text(data);
}

export async function resolveOrderSubstitution(input: {
  requestId: string;
  decision: SubstitutionDecision;
  expectedVersion: number;
  note?: string;
}) {
  if (!supabase) return { resolved: true, state: input.decision };
  const { data, error } = await supabase.rpc('resolve_order_substitution', {
    target_request_id: input.requestId,
    target_decision: input.decision,
    expected_version: input.expectedVersion,
    target_note: input.note?.trim() ?? '',
    client_session_token: getStoredClientSessionToken()
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { resolved?: boolean; state?: string };
  if (result.resolved === false) throw new Error('Решение уже изменилось. Обновите заказ.');
  return result;
}

export async function sendOrderMessage(
  orderId: string,
  catalogId: string,
  body: string,
  viewer: OrderConversationViewer = 'staff'
) {
  if (!supabase) return crypto.randomUUID();
  const { data, error } = viewer === 'driver'
    ? await supabase.rpc('send_driver_order_message', {
        target_order_id: orderId,
        target_catalog_id: catalogId,
        target_body: body.trim()
      })
    : await supabase.rpc('send_order_message', {
        target_order_id: orderId,
        target_catalog_id: catalogId,
        target_body: body.trim(),
        client_session_token: viewer === 'client' ? getStoredClientSessionToken() : null
      });
  if (error) throw new Error(error.message);
  return text(data);
}

export function subscribeOrderConversation(orderId: string, onChange: () => void) {
  if (!supabase) return () => undefined;
  const client = supabase;
  const channel = client
    .channel(`order-conversation-${orderId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_substitution_requests', filter: `order_id=eq.${orderId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payment_adjustments', filter: `order_id=eq.${orderId}` }, onChange)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export type OrderPickingItem = {
  id: string;
  title: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  quantityUnit: string;
  fulfillmentState: PickingLineState;
};
