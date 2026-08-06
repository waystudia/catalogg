import { useEffect, useState } from 'react';

export function CatalogLoadingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 98) return current;
        return Math.min(98, current + Math.max(1, Math.ceil((98 - current) / 12)));
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="catalog-loading-screen" role="status" aria-live="polite">
      <section className="catalog-loading-screen__content">
        <img src={`${import.meta.env.BASE_URL}assets/logo/wayyaam-icon-192.png`} alt="" />
        <strong>WayYaam</strong>
        <span>Загрузка каталога</span>
        <div className="catalog-loading-screen__track" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
        <b>{progress}%</b>
      </section>
    </main>
  );
}
