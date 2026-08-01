import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';

type SectionMap = Map<string, HTMLElement>;

export function useCatalogCategoryObserver(
  sectionRefs: RefObject<SectionMap>,
  queryKey: string,
  sectionCount: number,
  setActive: Dispatch<SetStateAction<string>>
) {
  const pendingCategoryRef = useRef<string | null>(null);

  useEffect(() => {
    const elements = Array.from(sectionRefs.current.values());
    if (elements.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
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
    return () => observer.disconnect();
  }, [queryKey, sectionCount, sectionRefs, setActive]);

  return useCallback((id: string, target?: HTMLElement) => {
    pendingCategoryRef.current = target ? id : null;
  }, []);
}
