import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getClientNotifications,
  markClientNotificationRead,
  type ClientNotification
} from '../../shared/api/clientNotificationsApi';
import {
  getRestaurantOrderNotificationPermission,
  requestRestaurantOrderNotificationPermission,
  restoreRestaurantOrderNotificationSubscription
} from '../../shared/restaurantOrderNotifications';
import './client-notifications.css';

const formatNotificationTime = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
};

export function ClientNotificationCenter({
  orderId,
  onAddonAction
}: {
  orderId?: string;
  onAddonAction?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState(getRestaurantOrderNotificationPermission);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [error, setError] = useState('');
  const notificationsQuery = useQuery({
    queryKey: ['client-notifications'],
    queryFn: () => getClientNotifications(30),
    refetchInterval: 20_000,
    retry: 1
  });
  const snapshot = notificationsQuery.data ?? { unreadCount: 0, notifications: [] };

  useEffect(() => {
    if (!orderId) return undefined;
    void restoreRestaurantOrderNotificationSubscription({ role: 'client', orderId })
      .then(setPermission);
    return undefined;
  }, [orderId]);

  const enablePush = async () => {
    if (isEnablingPush || !orderId) return;
    setIsEnablingPush(true);
    setError('');
    try {
      const nextPermission = await requestRestaurantOrderNotificationPermission({
        role: 'client',
        orderId
      });
      setPermission(nextPermission);
      if (nextPermission === 'denied') setError('Уведомления запрещены в настройках браузера.');
      if (nextPermission === 'default') setError('Push пока не включён. Попробуйте ещё раз.');
    } catch {
      setError('Не удалось включить push. In-app уведомления продолжат работать.');
    } finally {
      setIsEnablingPush(false);
    }
  };

  const openNotification = async (notification: ClientNotification) => {
    setError('');
    try {
      if (!notification.readAt) {
        await markClientNotificationRead(notification.id);
        await queryClient.invalidateQueries({ queryKey: ['client-notifications'] });
      }
      setIsOpen(false);
      if (notification.type === 'POST_ORDER_ADDON_AVAILABLE') {
        if (onAddonAction) onAddonAction();
        else if (notification.actionUrl.startsWith('/')) navigate(notification.actionUrl);
      }
    } catch {
      setError('Не удалось отметить уведомление прочитанным.');
    }
  };

  return (
    <section className="client-notification-center">
      <button
        className="client-notification-center__trigger"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Уведомления"
      >
        {snapshot.unreadCount > 0 ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {snapshot.unreadCount > 0 && <span>{Math.min(snapshot.unreadCount, 99)}</span>}
      </button>

      {isOpen && (
        <div
          className="client-notification-center__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsOpen(false);
          }}
        >
          <section className="client-notification-center__sheet" role="dialog" aria-modal="true" aria-labelledby="client-notifications-title">
            <header>
              <div>
                <small>WayYaam</small>
                <h2 id="client-notifications-title">Уведомления</h2>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Закрыть уведомления">
                <X aria-hidden="true" />
              </button>
            </header>

            {orderId && permission !== 'granted' && permission !== 'unsupported' && (
              <button
                className="client-notification-center__push"
                type="button"
                disabled={isEnablingPush}
                onClick={() => void enablePush()}
              >
                <Bell aria-hidden="true" />
                <span>
                  <strong>{isEnablingPush ? 'Включаем…' : 'Включить push'}</strong>
                  <small>Сообщим, даже если приложение свёрнуто</small>
                </span>
              </button>
            )}

            <div className="client-notification-center__list">
              {notificationsQuery.isLoading ? (
                Array.from({ length: 3 }, (_, index) => <span className="client-notification-center__skeleton" key={index} />)
              ) : snapshot.notifications.length > 0 ? (
                snapshot.notifications.map((notification) => (
                  <button
                    type="button"
                    data-unread={!notification.readAt}
                    onClick={() => void openNotification(notification)}
                    key={notification.id}
                  >
                    <span>{notification.readAt ? <Check aria-hidden="true" /> : <Bell aria-hidden="true" />}</span>
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.body}</small>
                      <time dateTime={notification.createdAt}>{formatNotificationTime(notification.createdAt)}</time>
                    </span>
                  </button>
                ))
              ) : (
                <p>Новых уведомлений пока нет.</p>
              )}
            </div>
            {(error || notificationsQuery.isError) && (
              <p className="client-notification-center__error" role="alert">
                {error || 'Не удалось загрузить уведомления. Повторим автоматически.'}
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
