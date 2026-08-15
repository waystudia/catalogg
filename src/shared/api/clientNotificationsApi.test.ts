import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapClientNotificationSnapshot } from './clientNotificationsModels';

describe('client notification mapping', () => {
  it('keeps valid notification rows and the server unread count', () => {
    const snapshot = mapClientNotificationSnapshot({
      unread_count: 2,
      notifications: [
        {
          id: 'notification-1',
          type: 'POST_ORDER_ADDON_AVAILABLE',
          title: 'Добавить к доставке?',
          body: 'Напитки и снеки по пути',
          action_url: '/mangal/order/order-1?addon=1',
          read_at: null,
          expires_at: '2026-08-15T12:05:00Z',
          created_at: '2026-08-15T12:00:00Z',
          metadata: { order_group_id: 'group-1' }
        },
        { id: '', title: 'invalid' }
      ]
    });

    assert.equal(snapshot.unreadCount, 2);
    assert.equal(snapshot.notifications.length, 1);
    assert.equal(snapshot.notifications[0]?.actionUrl, '/mangal/order/order-1?addon=1');
    assert.equal(snapshot.notifications[0]?.readAt, null);
  });

  it('returns a stable empty snapshot for malformed payloads', () => {
    assert.deepEqual(mapClientNotificationSnapshot(null), {
      unreadCount: 0,
      notifications: []
    });
  });
});
