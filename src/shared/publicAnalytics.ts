import type { PublicAnalyticsEvent } from './analyticsConsent';
import { supabase } from './supabase';

type AnalyticsRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: { message?: string } | null }>;
};

export const recordPublicAnalyticsEvent = async (
  event: PublicAnalyticsEvent,
  client: AnalyticsRpcClient | null = supabase as unknown as AnalyticsRpcClient | null
) => {
  if (!client) throw new Error('analytics_endpoint_unavailable');
  const { error } = await client.rpc('record_public_analytics_event', {
    target_event_name: event.eventName,
    target_route: event.route,
    target_session_id: event.sessionId
  });
  if (error) throw new Error(error.message || 'analytics_event_rejected');
};

export const deletePublicAnalyticsSession = async (
  sessionId: string,
  client: AnalyticsRpcClient | null = supabase as unknown as AnalyticsRpcClient | null
) => {
  if (!client) throw new Error('analytics_endpoint_unavailable');
  const { error } = await client.rpc('delete_public_analytics_session', {
    target_session_id: sessionId
  });
  if (error) throw new Error(error.message || 'analytics_session_delete_rejected');
};
