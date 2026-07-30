import { registerWebPushSubscription } from './webPush';
import { canRestoreWebPushSubscription, type WebPushContext } from './webPushContext';

type NotificationState = NotificationPermission | 'unsupported';

const notificationIsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const getRestaurantOrderNotificationPermission = (): NotificationState => {
  if (!notificationIsSupported()) return 'unsupported';
  return Notification.permission;
};

export async function requestRestaurantOrderNotificationPermission(context?: WebPushContext): Promise<NotificationState> {
  if (!notificationIsSupported()) return 'unsupported';

  try {
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission === 'granted' && context) {
      const registered = await registerWebPushSubscription(context);
      return registered ? 'granted' : 'default';
    }
    return permission;
  } catch {
    return Notification.permission;
  }
}

export async function restoreRestaurantOrderNotificationSubscription(context: WebPushContext): Promise<NotificationState> {
  const permission = getRestaurantOrderNotificationPermission();
  if (!canRestoreWebPushSubscription(permission, context)) return permission;

  try {
    const registered = await registerWebPushSubscription(context);
    return registered ? 'granted' : 'default';
  } catch {
    // The next PWA open will retry registration without interrupting the worker.
    return 'default';
  }
}

export async function showRestaurantOrderNotification({
  title,
  body,
  tag,
  url
}: {
  title: string;
  body: string;
  tag: string;
  url?: string;
}) {
  let permission = getRestaurantOrderNotificationPermission();
  if (permission === 'unsupported' || permission === 'denied') return;

  if (permission === 'default') {
    permission = await requestRestaurantOrderNotificationPermission();
  }

  if (permission !== 'granted') return;

  const notification = new Notification(title, {
    body,
    tag,
    requireInteraction: true
  });

  notification.onclick = () => {
    window.focus();
    if (url) {
      window.location.href = url;
    }
    notification.close();
  };
}
