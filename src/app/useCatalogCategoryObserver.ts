import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';

type SectionMap = Map<string, HTMLElement>;

export function useCatalogCategoryObserver(
  sectionRefs: RefObject<SectionMap>,
  queryKey: string,
  sectionCount: number,
  setActive: Dispatch<SetStateAction<string>>,
  restoredCategory?: string
) {
  const pendingCategoryRef = useRef<string | null>(null);
  const initialRestoredCategory = useRef(restoredCategory);
  const restorationLock = useRef(Boolean(restoredCategory));

  useEffect(() => {
    const sections = sectionRefs.current;
    if (!sections) return undefined;

    const elements = Array.from(sections.values());
    if (elements.length === 0) return undefined;

    const interrupt = () => { restorationLock.current = false; pendingCategoryRef.current = null; };
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt, { passive: true });
    window.addEventListener('keydown', interrupt);
    const observer = new IntersectionObserver(
      (entries) => {
        if (restorationLock.current && initialRestoredCategory.current && sections.has(initialRestoredCategory.current)) return;
        const pendingCategory = pendingCategoryRef.current;
        if (pendingCategory) {
          const pendingEntry = entries.find(
            (entry) => entry.target.getAttribute('data-catalog-section') === pendingCategory
          );
          if (pendingEntry?.isIntersecting) {
            setActive(pendingCategory);
            pendingCategoryRef.current = null;
          }
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        const next = visible[0]?.target.getAttribute('data-catalog-section');
        if (next) setActive(next);
      },
      { rootMargin: '-84px 0px -62% 0px', threshold: [0, 0.01] }
    );

    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', interrupt);
    };
  }, [queryKey, sectionCount, sectionRefs, setActive]);

  return useCallback((id: string, target?: HTMLElement) => {
    restorationLock.current = false;
    pendingCategoryRef.current = target ? id : null;
  }, []);
}
