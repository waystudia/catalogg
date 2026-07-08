type NotificationState = NotificationPermission | 'unsupported';

const notificationIsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const getRestaurantOrderNotificationPermission = (): NotificationState => {
  if (!notificationIsSupported()) return 'unsupported';
  return Notification.permission;
};

export async function requestRestaurantOrderNotificationPermission(): Promise<NotificationState> {
  if (!notificationIsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
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
