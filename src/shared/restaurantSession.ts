export const RESTAURANT_SESSION_CHECK_TIMEOUT_MS = 10_000;

export class SessionRestorationUnavailableError extends Error {
  constructor() {
    super('Не удалось проверить сессию. Повторяем подключение.');
    this.name = 'SessionRestorationUnavailableError';
  }
}

export const settleRestaurantSessionCheck = async (
  request: PromiseLike<boolean>,
  timeoutMs = RESTAURANT_SESSION_CHECK_TIMEOUT_MS
): Promise<boolean> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new SessionRestorationUnavailableError()), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
};
