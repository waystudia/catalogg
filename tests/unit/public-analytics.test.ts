import { describe, expect, it, vi } from 'vitest';
import { deletePublicAnalyticsSession, recordPublicAnalyticsEvent } from '../../src/shared/publicAnalytics';

describe('first-party public analytics transport', () => {
  it('sends only the anonymous session, event name and coarse route', async () => {
    const rpc = vi.fn(async () => ({ error: null }));

    await recordPublicAnalyticsEvent({
      eventName: 'page_view',
      route: '/catalog',
      sessionId: '11111111-1111-4111-8111-111111111111'
    }, { rpc });

    expect(rpc).toHaveBeenCalledWith('record_public_analytics_event', {
      target_event_name: 'page_view',
      target_route: '/catalog',
      target_session_id: '11111111-1111-4111-8111-111111111111'
    });
  });

  it('fails closed when the analytics endpoint rejects the event', async () => {
    const rpc = vi.fn(async () => ({ error: new Error('offline') }));

    await expect(recordPublicAnalyticsEvent({
      eventName: 'page_view',
      route: '/catalog',
      sessionId: '11111111-1111-4111-8111-111111111111'
    }, { rpc })).rejects.toThrow('offline');
  });

  it('fails closed when no analytics endpoint is configured', async () => {
    await expect(recordPublicAnalyticsEvent({
      eventName: 'page_view',
      route: '/catalog',
      sessionId: '11111111-1111-4111-8111-111111111111'
    }, null)).rejects.toThrow('analytics_endpoint_unavailable');
  });

  it('deletes the anonymous server history when consent is withdrawn', async () => {
    const rpc = vi.fn(async () => ({ error: null }));

    await deletePublicAnalyticsSession('11111111-1111-4111-8111-111111111111', { rpc });

    expect(rpc).toHaveBeenCalledWith('delete_public_analytics_session', {
      target_session_id: '11111111-1111-4111-8111-111111111111'
    });
  });

  it('reports deletion failures and unavailable endpoints', async () => {
    const rpc = vi.fn(async () => ({ error: {} }));
    await expect(deletePublicAnalyticsSession('11111111-1111-4111-8111-111111111111', { rpc }))
      .rejects.toThrow('analytics_session_delete_rejected');
    await expect(deletePublicAnalyticsSession('11111111-1111-4111-8111-111111111111', null))
      .rejects.toThrow('analytics_endpoint_unavailable');
  });
});
