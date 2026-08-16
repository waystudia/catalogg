import { useEffect } from 'react';
import {
  captureCurrentScroll,
  exactHistoryPushEvent,
  readExactScroll,
  withExactScroll,
  type ExactScrollPosition
} from './exactScrollState';

export function ExactScrollRestoration() {
  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    let captureFrame = 0;
    let restoreFrame = 0;
    let restoreToken = 0;
    let restoring = false;
    let popInProgress = false;

    if (!readExactScroll(window.history.state)) captureCurrentScroll();

    const capture = () => {
      if (restoring) return;
      window.cancelAnimationFrame(captureFrame);
      captureFrame = window.requestAnimationFrame(captureCurrentScroll);
    };
    const restore = (position: ExactScrollPosition) => {
      const token = ++restoreToken;
      const startedAt = window.performance.now();
      restoring = true;
      window.cancelAnimationFrame(captureFrame);
      window.cancelAnimationFrame(restoreFrame);

      const apply = () => {
        if (token !== restoreToken) return;
        window.scrollTo({ left: position.x, top: position.y, behavior: 'auto' });
        if (window.performance.now() - startedAt < 1_000) {
          restoreFrame = window.requestAnimationFrame(apply);
          return;
        }
        restoring = false;
        captureCurrentScroll();
      };
      apply();
    };
    const restoreFromState = (state: unknown) => {
      restore(readExactScroll(state) ?? { x: 0, y: 0 });
    };
    const allowUserScroll = () => {
      if (!restoring) return;
      restoreToken += 1;
      restoring = false;
      window.cancelAnimationFrame(restoreFrame);
      capture();
    };
    const onPopState = (event: PopStateEvent) => {
      popInProgress = true;
      window.requestAnimationFrame(() => restoreFromState(event.state));
      window.setTimeout(() => { popInProgress = false; }, 100);
    };
    const onHashChange = () => {
      window.requestAnimationFrame(() => {
        if (popInProgress) return;
        window.history.replaceState(
          withExactScroll(window.history.state, { x: 0, y: 0 }),
          '',
          window.location.href
        );
        restore({ x: 0, y: 0 });
      });
    };
    const onHistoryPush = () => {
      window.history.replaceState(
        withExactScroll(window.history.state, { x: 0, y: 0 }),
        '',
        window.location.href
      );
      restore({ x: 0, y: 0 });
    };

    window.addEventListener('scroll', capture, { passive: true });
    window.addEventListener('pointerdown', allowUserScroll, { passive: true });
    window.addEventListener('touchstart', allowUserScroll, { passive: true });
    window.addEventListener('wheel', allowUserScroll, { passive: true });
    window.addEventListener('keydown', allowUserScroll);
    document.addEventListener('click', captureCurrentScroll, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(exactHistoryPushEvent, onHistoryPush);
    return () => {
      window.cancelAnimationFrame(captureFrame);
      window.cancelAnimationFrame(restoreFrame);
      window.removeEventListener('scroll', capture);
      window.removeEventListener('pointerdown', allowUserScroll);
      window.removeEventListener('touchstart', allowUserScroll);
      window.removeEventListener('wheel', allowUserScroll);
      window.removeEventListener('keydown', allowUserScroll);
      document.removeEventListener('click', captureCurrentScroll, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(exactHistoryPushEvent, onHistoryPush);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  return null;
}
