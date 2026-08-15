export type ClientNotification = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly actionUrl: string;
  readonly readAt: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type ClientNotificationSnapshot = {
  readonly unreadCount: number;
  readonly notifications: readonly ClientNotification[];
};

export const emptyClientNotificationSnapshot: ClientNotificationSnapshot = {
  unreadCount: 0,
  notifications: []
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asText = (value: unknown) => typeof value === 'string' ? value : '';

export const mapClientNotificationSnapshot = (value: unknown): ClientNotificationSnapshot => {
  const record = asRecord(value);
  if (!record) return emptyClientNotificationSnapshot;
  const notifications = Array.isArray(record.notifications)
    ? record.notifications.flatMap((item) => {
        const row = asRecord(item);
        const id = asText(row?.id);
        const title = asText(row?.title);
        if (!row || !id || !title) return [];
        return [{
          id,
          type: asText(row.type),
          title,
          body: asText(row.body),
          actionUrl: asText(row.action_url),
          readAt: asText(row.read_at) || null,
          expiresAt: asText(row.expires_at) || null,
          createdAt: asText(row.created_at),
          metadata: asRecord(row.metadata) ?? {}
        } satisfies ClientNotification];
      })
    : [];
  const unreadCount = Number(record.unread_count);
  return {
    unreadCount: Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0,
    notifications
  };
};
