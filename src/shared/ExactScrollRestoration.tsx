import { useEffect } from 'react';
import {
  captureCurrentScroll,
  exactHistoryPushEvent,
  readExactScroll,
  withExactScroll,
  type ExactScrollPosition
} from './exactScrollState';

const restoreScroll = (position: ExactScrollPosition, attempt = 0) => {
  window.scrollTo(position.x, position.y);
  if (Math.abs(window.scrollY - position.y) <= 2 || attempt >= 24) return;
  window.requestAnimationFrame(() => restoreScroll(position, attempt + 1));
};

export function ExactScrollRestoration() {
  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    let frame = 0;
    let popInProgress = false;

    if (!readExactScroll(window.history.state)) captureCurrentScroll();

    const capture = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(captureCurrentScroll);
    };
    const restoreFromState = (state: unknown) => {
      restoreScroll(readExactScroll(state) ?? { x: 0, y: 0 });
    };
    const onPopState = (event: PopStateEvent) => {
      popInProgress = true;
      window.requestAnimationFrame(() => restoreFromState(event.state));
      window.setTimeout(() => { popInProgress = false; }, 0);
    };
    const onHashChange = () => {
      if (popInProgress) return;
      window.scrollTo(0, 0);
      window.history.replaceState(
        withExactScroll(window.history.state, { x: 0, y: 0 }),
        '',
        window.location.href
      );
    };
    const onHistoryPush = () => {
      window.scrollTo(0, 0);
      window.history.replaceState(
        withExactScroll(window.history.state, { x: 0, y: 0 }),
        '',
        window.location.href
      );
    };

    window.addEventListener('scroll', capture, { passive: true });
    document.addEventListener('click', captureCurrentScroll, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(exactHistoryPushEvent, onHistoryPush);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', capture);
      document.removeEventListener('click', captureCurrentScroll, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(exactHistoryPushEvent, onHistoryPush);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  return null;
}
