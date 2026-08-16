export const exactScrollStateKey = '__wayyaamExactScroll';
export const exactHistoryPushEvent = 'wayyaam:history-push';

export type ExactScrollPosition = { x: number; y: number };

type HistoryWithScroll = Record<string, unknown> & {
  [exactScrollStateKey]?: ExactScrollPosition;
};

const asHistoryState = (value: unknown): HistoryWithScroll =>
  value && typeof value === 'object' ? value as HistoryWithScroll : {};

export const readExactScroll = (state: unknown): ExactScrollPosition | null => {
  const position = asHistoryState(state)[exactScrollStateKey];
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return { x: Math.max(0, position.x), y: Math.max(0, position.y) };
};

export const withExactScroll = (state: unknown, position: ExactScrollPosition): HistoryWithScroll => ({
  ...asHistoryState(state),
  [exactScrollStateKey]: position
});

export const captureCurrentScroll = () => {
  window.history.replaceState(
    withExactScroll(window.history.state, { x: window.scrollX, y: window.scrollY }),
    '',
    window.location.href
  );
};
