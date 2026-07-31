export const RESTAURANT_SESSION_CHECK_TIMEOUT_MS = 10_000;

export const settleRestaurantSessionCheck = async (
  request: PromiseLike<boolean>,
  timeoutMs = RESTAURANT_SESSION_CHECK_TIMEOUT_MS
): Promise<boolean> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
};
