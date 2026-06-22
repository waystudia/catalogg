import { useMemo, useState } from 'react';
import { catalogData, type CatalogProduct, type CatalogSection } from '../data/catalog';

const currency = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'KZT',
  maximumFractionDigits: 0
});

function matchesQuery(product: CatalogProduct, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [product.name, product.description, ...product.tags]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function ProductCard({
  product,
  onAdd
}: {
  product: CatalogProduct;
  onAdd: (product: CatalogProduct) => void;
}) {
  return (
    <article className="product-card">
      <div className="product-card__meta">
        <span className="product-card__tag">{product.category}</span>
        <span className={`product-card__availability ${product.available ? 'is-available' : 'is-unavailable'}`}>
          {product.available ? 'Доступно' : 'Скоро вернется'}
        </span>
      </div>
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <ul className="product-card__tags" aria-label="Характеристики">
        {product.tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
      <div className="product-card__footer">
        <strong>{currency.format(product.price)}</strong>
        <button type="button" onClick={() => onAdd(product)} disabled={!product.available}>
          {product.available ? 'В корзину' : 'Недоступно'}
        </button>
      </div>
    </article>
  );
}

function SectionBlock({
  section,
  query,
  onAdd
}: {
  section: CatalogSection;
  query: string;
  onAdd: (product: CatalogProduct) => void;
}) {
  const filteredProducts = section.products.filter((product) => matchesQuery(product, query));

  if (filteredProducts.length === 0) {
    return null;
  }

  return (
    <section className="catalog-section">
      <div className="catalog-section__header">
        <div>
          <span className="eyebrow">{section.eyebrow}</span>
          <h2>{section.title}</h2>
        </div>
        <p>{section.description}</p>
      </div>
      <div className="product-grid">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}

export function App() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cartCount, setCartCount] = useState(0);

  const categories = useMemo(
    () => ['all', ...catalogData.sections.map((section) => section.slug)],
    []
  );

  const visibleSections = useMemo(() => {
    return catalogData.sections.filter((section) => {
      if (selectedCategory === 'all') {
        return true;
      }

      return section.slug === selectedCategory;
    });
  }, [selectedCategory]);

  const visibleProductsCount = useMemo(() => {
    return visibleSections.reduce((total, section) => {
      return total + section.products.filter((product) => matchesQuery(product, query)).length;
    }, 0);
  }, [query, visibleSections]);

  const addToCart = (product: CatalogProduct) => {
    setCartCount((count) => count + 1);
    window.localStorage.setItem(
      'mangal:last-added-product',
      JSON.stringify({
        id: product.id,
        name: product.name,
        addedAt: new Date().toISOString()
      })
    );
  };

  return (
    <div className="page-shell">
      <header className="hero">
        <nav className="topbar">
          <span className="brand">Mangal Catalog</span>
          <div className="topbar__status">
            <span className="status-dot" />
            <span>Работает локально без Supabase</span>
          </div>
        </nav>

        <div className="hero__content">
          <div className="hero__copy">
            <span className="eyebrow">Готово к запуску</span>
            <h1>Каталог открывается и работает автономно</h1>
            <p>
              Проект больше не застревает на стартовом экране. Сейчас это рабочая
              локальная версия с демонстрационными данными, поиском и корзиной.
            </p>
            <div className="hero__actions">
              <label className="search">
                <span className="search__label">Поиск по меню</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Например, лагман или манты"
                />
              </label>
              <div className="hero__stats">
                <div>
                  <strong>{catalogData.sections.length}</strong>
                  <span>раздела</span>
                </div>
                <div>
                  <strong>{visibleProductsCount}</strong>
                  <span>позиций</span>
                </div>
                <div>
                  <strong>{cartCount}</strong>
                  <span>в корзине</span>
                </div>
              </div>
            </div>
          </div>

          <aside className="info-card">
            <span className="eyebrow">Что исправлено</span>
            <ul>
              <li>убрана критическая зависимость от отсутствующих исходников;</li>
              <li>интерфейс загружается без `.env` и без внешней БД;</li>
              <li>проект снова собирается стандартным `npm run build`.</li>
            </ul>
          </aside>
        </div>
      </header>

      <main className="content">
        <section className="toolbar">
          <div className="toolbar__filters">
            {categories.map((category) => {
              const isActive = selectedCategory === category;
              const label =
                category === 'all'
                  ? 'Все'
                  : catalogData.sections.find((section) => section.slug === category)?.title ?? category;

              return (
                <button
                  key={category}
                  type="button"
                  className={isActive ? 'chip is-active' : 'chip'}
                  onClick={() => setSelectedCategory(category)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="toolbar__hint">
            Можно потом снова подключить Supabase, но теперь это необязательное улучшение, а не блокер запуска.
          </p>
        </section>

        {visibleProductsCount === 0 ? (
          <section className="empty-state">
            <h2>Ничего не найдено</h2>
            <p>Попробуйте очистить поиск или переключиться на другой раздел меню.</p>
          </section>
        ) : (
          visibleSections.map((section) => (
            <SectionBlock key={section.slug} section={section} query={query} onAdd={addToCart} />
          ))
        )}
      </main>
    </div>
  );
}
