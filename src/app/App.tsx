import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Beef,
  CalendarDays,
  Check,
  ChefHat,
  Coffee,
  Edit3,
  Flame,
  Home,
  LogOut,
  Minus,
  Package,
  Pizza,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Star,
  Trash2,
  User,
  Users
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Category, Product, ThemeSettings } from '../entities/models';
import {
  hasDrinkInCart,
  selectCartCount,
  selectCartTotal,
  useAdminStore,
  useAuthStore,
  useCartStore,
  useOrderStore,
  useThemeStore
} from '../features/stores';
import { loadCatalog } from '../shared/supabase';

const queryClient = new QueryClient();

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

type Screen = 'home' | 'catalog' | 'drinks' | 'product' | 'checkout';

const iconMap = {
  pot: ChefHat,
  pizza: Pizza,
  burger: Beef,
  flame: Flame,
  bottle: ShoppingBag,
  glass: Coffee,
  tea: Coffee,
  home: Home
};

function applyTheme(theme: ThemeSettings) {
  return {
    '--bg': theme.background_color,
    '--card': theme.card_color,
    '--radius': `${theme.card_radius}px`,
    '--shadow': theme.card_shadow,
    '--text': theme.text_primary,
    '--muted': theme.text_secondary,
    '--accent': theme.accent_color,
    '--accent-2': theme.accent_secondary,
    '--button-radius': `${theme.button_radius}px`,
    backgroundImage:
      theme.background_type === 'image' && theme.background_image_url
        ? `linear-gradient(rgba(5, 6, 7, 0.78), rgba(5, 6, 7, 0.92)), url(${theme.background_image_url})`
        : undefined
  } as React.CSSProperties;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand-logo brand-logo--compact' : 'brand-logo'}>
      <Flame />
      <div>
        <strong>Мангал</strong>
        {!compact && <span>ресторан</span>}
      </div>
    </div>
  );
}

function TopBar({
  title,
  canBack,
  onBack,
  onSearch,
  onCart,
  onAdmin
}: {
  title?: string;
  canBack?: boolean;
  onBack: () => void;
  onSearch?: () => void;
  onCart: () => void;
  onAdmin?: () => void;
}) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);

  return (
    <header className="top-bar">
      <button className="icon-button" type="button" onClick={canBack ? onBack : onAdmin} aria-label="Назад">
        {canBack ? <ArrowLeft /> : <User />}
      </button>
      {title ? <h1 className="screen-title">{title}</h1> : <Logo />}
      <div className="top-bar__actions">
        {onSearch && (
          <button className="icon-button" type="button" onClick={onSearch} aria-label="Поиск">
            <Search />
          </button>
        )}
        <button className="icon-button cart-icon" type="button" onClick={onCart} aria-label="Корзина">
          <ShoppingCart />
          {count > 0 && <span>{count}</span>}
        </button>
      </div>
    </header>
  );
}

function CategoryPills({
  categories,
  active,
  onSelect,
  includeAll = true
}: {
  categories: Category[];
  active: string;
  onSelect: (id: string) => void;
  includeAll?: boolean;
}) {
  return (
    <div className="pills">
      {includeAll && (
        <button className={active === 'all' ? 'pill is-active' : 'pill'} type="button" onClick={() => onSelect('all')}>
          Все
        </button>
      )}
      {categories.map((category) => (
        <button
          className={active === category.id ? 'pill is-active' : 'pill'}
          type="button"
          key={category.id}
          onClick={() => onSelect(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}

function ProductTile({
  product,
  variant = 'compact',
  onOpen
}: {
  product: Product;
  variant?: 'compact' | 'large' | 'drink';
  onOpen: (product: Product) => void;
}) {
  const add = useCartStore((state) => state.add);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const soldOut = product.stock_count <= 0;

  return (
    <article className={`product-tile product-tile--${variant}`} onClick={() => onOpen(product)}>
      <img src={product.image_url} alt={product.title} loading="lazy" />
      <div className="product-tile__body">
        <div>
          <h3>{product.title}</h3>
          <p>{soldOut ? 'Закончилось' : product.description}</p>
        </div>
        <div className="product-tile__bottom">
          <strong>{formatPrice(product.price)}</strong>
          <button
            className="add-button"
            type="button"
            disabled={soldOut}
            aria-label={`Добавить ${product.title}`}
            onClick={(event) => {
              event.stopPropagation();
              add(product);
            }}
          >
            <Plus />
          </button>
        </div>
      </div>
      {isAdmin && (
        <div className="admin-card-tools" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label="Редактировать">
            <Edit3 />
          </button>
          <button className={product.is_popular ? 'is-on' : ''} type="button" aria-label="Популярное">
            <Star />
          </button>
          <button className={product.is_hit ? 'is-on' : ''} type="button" aria-label="Хит">
            <Flame />
          </button>
          <button type="button" aria-label="Удалить">
            <Trash2 />
          </button>
        </div>
      )}
    </article>
  );
}

function CartBar({ onCheckout }: { onCheckout: () => void }) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);
  const total = selectCartTotal(items);

  if (count === 0) {
    return null;
  }

  return (
    <button className="cart-bar" type="button" onClick={onCheckout}>
      <span className="cart-bar__icon">
        <ShoppingCart />
        <b>{count}</b>
      </span>
      <span>
        <strong>В корзине {count} товара</strong>
        <small>{items.map((item) => item.product.title).join(', ')}</small>
      </span>
      <b>{formatPrice(total)}</b>
      <span className="cart-bar__go">
        <ArrowRight />
      </span>
    </button>
  );
}

function HomeScreen({
  categories,
  products,
  onOpenCatalog,
  onOpenDrinks,
  onOpenProduct
}: {
  categories: Category[];
  products: Product[];
  onOpenCatalog: (categoryId?: string) => void;
  onOpenDrinks: () => void;
  onOpenProduct: (product: Product) => void;
}) {
  const [active, setActive] = useState('chechen');
  const featuredCategories = categories.filter((category) => ['fastfood', 'chechen', 'pizza', 'lemonades', 'fridge', 'cabins'].includes(category.id));
  const popular = products.filter((product) => product.is_popular).slice(0, 6);

  return (
    <main className="screen">
      <CategoryPills
        categories={categories.filter((category) => category.kind !== 'space').slice(0, 5)}
        active={active}
        onSelect={(id) => {
          setActive(id);
          if (id === 'fridge' || id === 'lemonades' || id === 'tea') {
            onOpenDrinks();
          }
        }}
        includeAll={false}
      />

      <section className="category-grid">
        {featuredCategories.map((category) => {
          const Icon = iconMap[category.icon as keyof typeof iconMap] ?? ChefHat;
          return (
            <button
              className="category-card"
              type="button"
              key={category.id}
              onClick={() => {
                if (category.kind === 'drink') {
                  onOpenDrinks();
                  return;
                }
                onOpenCatalog(category.id);
              }}
            >
              <img src={category.image} alt="" loading="lazy" />
              <span>
                <Icon />
              </span>
              <strong>{category.name}</strong>
              <ArrowRight />
            </button>
          );
        })}
      </section>

      <section className="section-head">
        <h2>Популярное</h2>
        <button type="button" onClick={() => onOpenCatalog()}>
          Показать все <ArrowRight />
        </button>
      </section>

      <section className="popular-grid">
        {popular.map((product) => (
          <ProductTile key={product.id} product={product} onOpen={onOpenProduct} />
        ))}
      </section>
    </main>
  );
}

function CatalogScreen({
  categories,
  products,
  initialCategory,
  onOpenProduct
}: {
  categories: Category[];
  products: Product[];
  initialCategory: string;
  onOpenProduct: (product: Product) => void;
}) {
  const [active, setActive] = useState(initialCategory);
  const [query, setQuery] = useState('');
  const foodCategories = categories.filter((category) => category.kind !== 'space');
  const filtered = products.filter((product) => {
    const categoryMatch = active === 'all' || product.category_id === active || (active === 'hits' && product.is_hit);
    const queryMatch = [product.title, product.description, product.ingredients].join(' ').toLowerCase().includes(query.toLowerCase());
    return categoryMatch && queryMatch;
  });

  return (
    <main className="screen">
      <label className="search-field">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо" />
      </label>
      <div className="pills">
        <button className={active === 'all' ? 'pill is-active' : 'pill'} type="button" onClick={() => setActive('all')}>
          Все
        </button>
        <button className={active === 'hits' ? 'pill is-active' : 'pill'} type="button" onClick={() => setActive('hits')}>
          Хиты <Flame />
        </button>
        {foodCategories.map((category) => (
          <button
            key={category.id}
            className={active === category.id ? 'pill is-active' : 'pill'}
            type="button"
            onClick={() => setActive(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <section className="catalog-grid">
        {filtered.map((product) => (
          <ProductTile key={product.id} product={product} variant="large" onOpen={onOpenProduct} />
        ))}
      </section>
    </main>
  );
}

function DrinksScreen({ products, onOpenProduct }: { products: Product[]; onOpenProduct: (product: Product) => void }) {
  const [active, setActive] = useState('Все');
  const groups = ['Все', ...Array.from(new Set(products.filter((product) => product.drink_type).map((product) => product.drink_type as string)))];
  const drinks = products.filter((product) => product.drink_type && (active === 'Все' || product.drink_type === active));

  return (
    <main className="screen">
      <div className="pills">
        {groups.map((group) => (
          <button className={active === group ? 'pill is-active' : 'pill'} type="button" key={group} onClick={() => setActive(group)}>
            {group}
          </button>
        ))}
      </div>
      <section className="drink-grid">
        {drinks.map((product) => (
          <ProductTile key={product.id} product={product} variant="drink" onOpen={onOpenProduct} />
        ))}
      </section>
    </main>
  );
}

function ProductScreen({ product, products }: { product: Product; products: Product[] }) {
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const items = useCartStore((state) => state.items);
  const quantity = items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const pairs = product.pair_ids.map((id) => products.find((item) => item.id === id)).filter((item): item is Product => Boolean(item));

  return (
    <main className="screen product-screen">
      <img className="product-hero" src={product.image_url} alt={product.title} />
      <div className="product-heading">
        <div>
          <h2>{product.title}</h2>
          <strong>{formatPrice(product.price)}</strong>
        </div>
        {product.is_hit && (
          <span className="hit-badge">
            <Flame /> Хит
          </span>
        )}
      </div>
      <p className="product-description">{product.description}</p>

      <dl className="facts">
        <div>
          <dt>Состав</dt>
          <dd>{product.ingredients}</dd>
        </div>
        <div>
          <dt>Вес</dt>
          <dd>{product.weight}</dd>
        </div>
        <div>
          <dt>Острота</dt>
          <dd>{product.spicy_level === 0 ? 'нет' : 'средняя'} {' '.repeat(1)}{'🔥'.repeat(product.spicy_level)}</dd>
        </div>
        <div>
          <dt>Подаётся</dt>
          <dd>{product.serving}</dd>
        </div>
      </dl>

      <div className="quantity">
        <button type="button" onClick={() => decrement(product.id)} aria-label="Уменьшить">
          <Minus />
        </button>
        <strong>{quantity}</strong>
        <button type="button" onClick={() => add(product)} aria-label="Увеличить">
          <Plus />
        </button>
      </div>

      <h3 className="subhead">Часто берут вместе</h3>
      <section className="pair-grid">
        {pairs.map((item) => (
          <ProductTile key={item.id} product={item} onOpen={() => undefined} />
        ))}
      </section>

      <button className="primary-wide" type="button" onClick={() => add(product)} disabled={product.stock_count <= 0}>
        {product.stock_count <= 0 ? 'Закончилось' : `Добавить в корзину - ${formatPrice(product.price)}`}
      </button>
    </main>
  );
}

function CheckoutScreen({ products }: { products: Product[] }) {
  const { mode, cabinId, date, time, guests, setOrder } = useOrderStore();
  const items = useCartStore((state) => state.items);
  const total = selectCartTotal(items);
  const orderText = encodeURIComponent(
    `Здравствуйте\nЗаказ:\n${items.map((item) => `- ${item.product.title} x${item.quantity}`).join('\n')}\nИтого: ${formatPrice(total)}\nФормат: ${mode === 'hall' ? 'В зале' : 'На вынос'}\nДата: ${date}\nВремя: ${time}\nГости: ${guests}`
  );
  const drinks = products.filter((product) => product.drink_type).slice(0, 4);

  return (
    <main className="screen checkout-screen">
      <section className="mode-grid">
        <button className={mode === 'hall' ? 'mode-card is-active' : 'mode-card'} type="button" onClick={() => setOrder({ mode: 'hall' })}>
          <img src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=78" alt="" />
          <Check />
          <strong>В зале</strong>
          <span>Забронировать место в зале</span>
        </button>
        <button className={mode === 'takeaway' ? 'mode-card is-active' : 'mode-card'} type="button" onClick={() => setOrder({ mode: 'takeaway' })}>
          <img src="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=78" alt="" />
          <Package />
          <strong>На вынос</strong>
          <span>Забрать заказ с собой</span>
        </button>
      </section>

      <h2>Кабинки</h2>
      <section className="cabin-grid">
        {['cabin-1', 'cabin-2', 'big-cabin', 'main-hall'].map((id, index) => (
          <button className={cabinId === id ? 'cabin-card is-active' : 'cabin-card'} type="button" key={id} onClick={() => setOrder({ cabinId: id })}>
            <img src={`https://images.unsplash.com/photo-${['1514933651103-005eec06c04b', '1559329007-40df8a9345d8', '1544148103-0773bf10d330', '1552566626-52f8b828add9'][index]}?auto=format&fit=crop&w=900&q=78`} alt="" />
            <Check />
            <strong>{['Кабинка №1', 'Кабинка №2', 'Большая кабинка', 'Общий зал'][index]}</strong>
            <span>
              <Users /> {['до 4 гостей', 'до 4 гостей', 'до 10 гостей', 'до 20 гостей'][index]}
            </span>
            <span>{['Закрывается шторами', 'Отдельная дверь', 'Отдельная дверь', 'Открытое пространство'][index]}</span>
          </button>
        ))}
      </section>

      <section className="booking-box">
        <h3>Детали бронирования</h3>
        <div className="booking-fields">
          <label>
            Дата
            <span>
              <input value={date} onChange={(event) => setOrder({ date: event.target.value })} />
              <CalendarDays />
            </span>
          </label>
          <label>
            Время
            <span>
              <input value={time} onChange={(event) => setOrder({ time: event.target.value })} />
            </span>
          </label>
          <label>
            Гостей
            <span>
              <input type="number" min={1} value={guests} onChange={(event) => setOrder({ guests: Number(event.target.value) })} />
              <Users />
            </span>
          </label>
        </div>
        <a className="primary-wide" href={`https://wa.me/79990000000?text=${orderText}`} target="_blank" rel="noreferrer">
          Забронировать
        </a>
      </section>

      {!hasDrinkInCart(items) && (
        <section className="forgot-inline">
          <Coffee />
          <div>
            <strong>Можно сделать предзаказ напитков</strong>
            <span>{drinks.map((drink) => drink.title).join(', ')}</span>
          </div>
        </section>
      )}
    </main>
  );
}

function DrinkReminder({
  products,
  onClose,
  onDrinks
}: {
  products: Product[];
  onClose: () => void;
  onDrinks: () => void;
}) {
  const add = useCartStore((state) => state.add);
  const drinks = products.filter((product) => product.drink_type).slice(0, 4);

  return (
    <div className="modal-backdrop">
      <section className="drink-modal">
        <div className="modal-handle" />
        <Coffee className="modal-icon" />
        <div className="modal-switch">
          <button className="is-active" type="button">
            <ShoppingCart /> В зале
          </button>
          <button type="button">
            <ShoppingBag /> На вынос
          </button>
        </div>
        <h2>Вы не выбрали напитки</h2>
        <p>Хотите добавить напитки к заказу?</p>
        <div className="modal-drinks">
          {drinks.map((drink) => (
            <article key={drink.id}>
              <img src={drink.image_url} alt={drink.title} />
              <strong>{drink.title}</strong>
              <span>{formatPrice(drink.price)}</span>
              <button type="button" onClick={() => add(drink)} aria-label={`Добавить ${drink.title}`}>
                <Plus />
              </button>
            </article>
          ))}
        </div>
        <button className="primary-wide" type="button" onClick={onDrinks}>
          Выбрать напитки
        </button>
        <button className="ghost-wide" type="button" onClick={onClose}>
          Продолжить без напитков
        </button>
      </section>
    </div>
  );
}

function LoginModal({ onClose }: { onClose: () => void }) {
  const login = useAuthStore((state) => state.login);
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const success = login(String(formData.get('email')), String(formData.get('password')));
    if (success) {
      onClose();
      return;
    }
    setError('Введите email и пароль от 4 символов.');
  };

  return (
    <div className="modal-backdrop">
      <form className="login-modal" onSubmit={submit}>
        <Logo compact />
        <label>
          Email
          <input name="email" type="email" placeholder="admin@restaurant.ru" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" placeholder="••••••••" required />
        </label>
        {error && <p>{error}</p>}
        <button className="primary-wide" type="submit">
          Войти
        </button>
        <button className="ghost-wide" type="button" onClick={onClose}>
          Закрыть
        </button>
      </form>
    </div>
  );
}

function AdminPanel() {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const logout = useAuthStore((state) => state.logout);
  const setEditor = useAdminStore((state) => state.setEditor);

  if (!isAdmin) {
    return null;
  }

  return (
    <nav className="admin-panel">
      <button type="button" onClick={() => setEditor('dish')}>
        <Plus /> Добавить блюдо
      </button>
      <button type="button" onClick={() => setEditor('categories')}>
        <ChefHat /> Категории
      </button>
      <button type="button" onClick={() => setEditor('design')}>
        <Star /> Дизайн
      </button>
      <button type="button" onClick={() => setEditor('settings')}>
        <Settings /> Настройки
      </button>
      <button type="button" onClick={logout} aria-label="Выйти">
        <LogOut />
      </button>
    </nav>
  );
}

function DesignEditor() {
  const editor = useAdminStore((state) => state.editor);
  const setEditor = useAdminStore((state) => state.setEditor);
  const theme = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);

  if (!editor) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="design-editor">
        <div className="editor-head">
          <h2>{editor === 'design' ? 'Редактор дизайна' : 'Админ-раздел'}</h2>
          <button className="icon-button" type="button" onClick={() => setEditor(null)}>
            <ArrowLeft />
          </button>
        </div>
        {editor === 'design' ? (
          <div className="theme-form">
            {[
              ['background_color', 'Фон'],
              ['text_primary', 'Текст'],
              ['text_secondary', 'Вторичный текст'],
              ['card_color', 'Карточки'],
              ['accent_color', 'Акцент'],
              ['accent_secondary', 'Акцент 2']
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="color"
                  value={String(theme[key as keyof ThemeSettings])}
                  onChange={(event) => updateTheme({ [key]: event.target.value })}
                />
              </label>
            ))}
            <label>
              Радиус карточек
              <input type="range" min="8" max="34" value={theme.card_radius} onChange={(event) => updateTheme({ card_radius: Number(event.target.value) })} />
            </label>
            <label>
              Радиус кнопок
              <input type="range" min="8" max="28" value={theme.button_radius} onChange={(event) => updateTheme({ button_radius: Number(event.target.value) })} />
            </label>
            <label>
              Фон-картинка
              <input value={theme.background_image_url} onChange={(event) => updateTheme({ background_image_url: event.target.value, background_type: event.target.value ? 'image' : 'color' })} placeholder="https://..." />
            </label>
          </div>
        ) : (
          <p className="admin-placeholder">
            Раздел уже подключен к админ-режиму. Следующий шаг - CRUD формы и загрузка изображений в bucket images.
          </p>
        )}
      </section>
    </div>
  );
}

function AppContent() {
  const { data } = useQuery({ queryKey: ['catalog'], queryFn: loadCatalog });
  const themeStore = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);
  const [screen, setScreen] = useState<Screen>('home');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const items = useCartStore((state) => state.items);

  useEffect(() => {
    if (data?.theme) {
      updateTheme(data.theme);
    }
  }, [data?.theme, updateTheme]);

  const catalog = data ?? {
    categories: [],
    products: [],
    source: 'demo' as const
  };

  const title = useMemo(() => {
    if (screen === 'catalog') return 'Все товары';
    if (screen === 'drinks') return 'Напитки';
    if (screen === 'checkout') return 'Оформление заказа';
    return undefined;
  }, [screen]);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setScreen('product');
  };

  const goCheckout = () => {
    if (!hasDrinkInCart(items) && screen !== 'drinks') {
      setShowReminder(true);
      return;
    }
    setScreen('checkout');
  };

  return (
    <div className="app-shell" style={applyTheme(themeStore)}>
      <TopBar
        title={screen === 'product' ? undefined : title}
        canBack={screen !== 'home'}
        onBack={() => setScreen('home')}
        onSearch={screen === 'home' ? () => setScreen('catalog') : undefined}
        onCart={goCheckout}
        onAdmin={() => setShowLogin(true)}
      />

      {screen === 'home' && (
        <HomeScreen
          categories={catalog.categories}
          products={catalog.products}
          onOpenCatalog={(categoryId = 'all') => {
            setCatalogCategory(categoryId);
            setScreen('catalog');
          }}
          onOpenDrinks={() => setScreen('drinks')}
          onOpenProduct={openProduct}
        />
      )}
      {screen === 'catalog' && (
        <CatalogScreen
          categories={catalog.categories}
          products={catalog.products}
          initialCategory={catalogCategory}
          onOpenProduct={openProduct}
        />
      )}
      {screen === 'drinks' && <DrinksScreen products={catalog.products} onOpenProduct={openProduct} />}
      {screen === 'product' && selectedProduct && <ProductScreen product={selectedProduct} products={catalog.products} />}
      {screen === 'checkout' && <CheckoutScreen products={catalog.products} />}

      <CartBar onCheckout={goCheckout} />
      <AdminPanel />
      <DesignEditor />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {showReminder && (
        <DrinkReminder
          products={catalog.products}
          onClose={() => {
            setShowReminder(false);
            setScreen('checkout');
          }}
          onDrinks={() => {
            setShowReminder(false);
            setScreen('drinks');
          }}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
