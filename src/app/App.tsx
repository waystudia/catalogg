import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Beef,
  CalendarDays,
  Check,
  ChefHat,
  CloudUpload,
  Coffee,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Flame,
  Home,
  Instagram,
  LogOut,
  MessageCircle,
  Minus,
  Package,
  Paintbrush,
  Pizza,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Tags,
  Trash2,
  User,
  Users,
  GripVertical
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { categories as demoCategories, products as demoProducts, restaurant as demoRestaurant } from '../data/catalog';
import type { CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../entities/models';
import { DishEditorPage } from '../features/dish-editor/DishEditorPage';
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

type SettingsScreen = 'settings' | 'settings-profile' | 'settings-categories' | 'settings-design' | 'settings-backup' | 'settings-delete';
type Screen = 'home' | 'catalog' | 'drinks' | 'product' | 'checkout' | SettingsScreen;
type ProductFlag = 'is_popular' | 'is_hidden';
type CatalogDesignExport = {
  theme?: 'light' | 'dark';
  backgroundColor?: string;
  primaryColor?: string;
  accentColor?: string;
  cardColor?: string;
  cardStyle?: 'light' | 'dark';
  textColor?: string;
  mutedTextColor?: string;
  productTitleColor?: string;
  categoryTitleColor?: string;
  radius?: number;
};

const defaultTags: CatalogTag[] = [
  { id: 'hit', name: 'Хит', icon: '🔥', color: '#ef4444' },
  { id: 'popular', name: 'Популярное', icon: '⭐', color: '#f59e0b' },
  { id: 'new', name: 'Новинка', icon: 'NEW', color: '#38bdf8' },
  { id: 'vegetarian', name: 'Вегетарианское', icon: '🌿', color: '#22c55e' }
];

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

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
    '--text': theme.text_primary ?? '#f8f5ef',
    '--muted': theme.text_secondary ?? '#aaa39a',
    '--product-title': theme.product_title_color ?? theme.text_primary ?? '#f8f5ef',
    '--category-title': theme.category_title_color ?? theme.text_primary ?? '#f8f5ef',
    '--accent': theme.accent_color,
    '--accent-2': theme.accent_secondary,
    '--button-radius': `${theme.button_radius}px`,
    '--primary-bg':
      theme.button_style === 'filled'
        ? `linear-gradient(135deg, ${theme.accent_secondary}, ${theme.accent_color})`
        : 'transparent',
    '--primary-text': theme.button_style === 'filled' ? '#1b1408' : theme.accent_secondary,
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
  onOpen,
  onEdit,
  onDelete,
  onToggle
}: {
  product: Product;
  variant?: 'compact' | 'large' | 'drink';
  onOpen: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (productId: string) => void;
  onToggle?: (productId: string, key: ProductFlag) => void;
}) {
  const add = useCartStore((state) => state.add);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const soldOut = product.stock_count <= 0;

  return (
    <article className={`product-tile product-tile--${variant}${product.is_hidden ? ' is-hidden' : ''}`} onClick={() => onOpen(product)}>
      <div className="product-tile__image">
        <img src={product.image_url} alt={product.title} loading="lazy" />
        {product.is_popular && (
          <span className="product-state product-state--popular">
            <Star />
          </span>
        )}
        {product.is_hidden && <span className="product-state product-state--hidden">Скрыто</span>}
        {isAdmin && (
          <div className="admin-card-tools" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Редактировать" onClick={() => onEdit?.(product)}>
              <Edit3 />
            </button>
            <button
              className={product.is_popular ? 'is-on' : ''}
              type="button"
              aria-label="Популярное"
              onClick={() => onToggle?.(product.id, 'is_popular')}
            >
              <Star />
            </button>
            <button
              className={product.is_hidden ? 'is-on' : ''}
              type="button"
              aria-label={product.is_hidden ? 'Показать' : 'Скрыть'}
              onClick={() => onToggle?.(product.id, 'is_hidden')}
            >
              {product.is_hidden ? <EyeOff /> : <Eye />}
            </button>
            <button type="button" aria-label="Удалить" onClick={() => onDelete?.(product.id)}>
              <Trash2 />
            </button>
          </div>
        )}
      </div>
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
  restaurant,
  categories,
  products,
  onOpenCatalog,
  onOpenDrinks,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  onOpenCatalog: (categoryId?: string) => void;
  onOpenDrinks: () => void;
  onOpenProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProduct: (productId: string, key: ProductFlag) => void;
}) {
  const [active, setActive] = useState('chechen');
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const featuredCategories = categories.filter((category) => ['fastfood', 'chechen', 'pizza', 'lemonades', 'fridge', 'cabins'].includes(category.id));
  const popular = visibleProducts.filter((product) => product.is_popular).slice(0, 6);
  const whatsapp = restaurant.whatsapp.replace(/[^\d]/g, '');

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
          <ProductTile
            key={product.id}
            product={product}
            onOpen={onOpenProduct}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onToggle={onToggleProduct}
          />
        ))}
      </section>

      <section className="social-section">
        <div>
          <h2>Наши соцсети</h2>
          <p>Свяжитесь с нами удобным способом</p>
        </div>
        <div className="social-actions">
          <a href={restaurant.instagram_url || 'https://instagram.com/'} target="_blank" rel="noreferrer">
            <Instagram /> Instagram
          </a>
          <a href={`https://wa.me/${whatsapp || '79990000000'}`} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}

function CatalogScreen({
  categories,
  products,
  initialCategory,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct
}: {
  categories: Category[];
  products: Product[];
  initialCategory: string;
  onOpenProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProduct: (productId: string, key: ProductFlag) => void;
}) {
  const [active, setActive] = useState(initialCategory);
  const [query, setQuery] = useState('');
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const foodCategories = categories.filter((category) => category.kind !== 'space');
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const filtered = visibleProducts.filter((product) => {
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
          <ProductTile
            key={product.id}
            product={product}
            variant="large"
            onOpen={onOpenProduct}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onToggle={onToggleProduct}
          />
        ))}
      </section>
    </main>
  );
}

function DrinksScreen({
  products,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct
}: {
  products: Product[];
  onOpenProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProduct: (productId: string, key: ProductFlag) => void;
}) {
  const [active, setActive] = useState('Все');
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const groups = ['Все', ...Array.from(new Set(visibleProducts.filter((product) => product.drink_type).map((product) => product.drink_type as string)))];
  const drinks = visibleProducts.filter((product) => product.drink_type && (active === 'Все' || product.drink_type === active));

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
          <ProductTile
            key={product.id}
            product={product}
            variant="drink"
            onOpen={onOpenProduct}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onToggle={onToggleProduct}
          />
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

function CheckoutScreen({ products, restaurant }: { products: Product[]; restaurant: Restaurant }) {
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
        <a className="primary-wide" href={`https://wa.me/${restaurant.whatsapp}?text=${orderText}`} target="_blank" rel="noreferrer">
          Забронировать
        </a>
      </section>

      <a className="instagram-link" href={restaurant.instagram_url} target="_blank" rel="noreferrer">
        <Instagram /> Instagram ресторана
      </a>

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

function LoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const login = useAuthStore((state) => state.login);
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const success = login(String(formData.get('email')), String(formData.get('password')));
    if (success) {
      onSuccess();
      onClose();
      return;
    }
    setError('Логин: admin, пароль: 1234.');
  };

  return (
    <div className="modal-backdrop">
      <form className="login-modal" onSubmit={submit}>
        <Logo compact />
        <label>
          Логин
          <input name="email" placeholder="admin" autoCapitalize="none" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" placeholder="1234" required />
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

function AdminPanel({ onAdd, onSettings }: { onAdd: () => void; onSettings: () => void }) {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const logout = useAuthStore((state) => state.logout);

  if (!isAdmin) {
    return null;
  }

  return (
    <nav className="admin-panel">
      <button type="button" onClick={onAdd}>
        <Plus /> Добавить
      </button>
      <button type="button" onClick={onSettings}>
        <Settings /> Настройки
      </button>
      <button type="button" onClick={logout} aria-label="Выйти">
        <LogOut /> Выход
      </button>
    </nav>
  );
}

function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="settings-header">
      <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
      <span />
    </header>
  );
}

function SettingsHome({ onOpen }: { onOpen: (screen: SettingsScreen) => void }) {
  const items = [
    ['settings-profile', Store, 'Профиль ресторана', 'Название + контакты'],
    ['settings-categories', Tags, 'Параметры и категории', 'Категории + метки'],
    ['settings-design', Paintbrush, 'Дизайн приложения', 'Цвета, тема'],
    ['settings-backup', CloudUpload, 'Импорт и экспорт', 'Бэкапы'],
    ['settings-delete', Trash2, 'Удалить каталог', 'Красная зона']
  ] as const;

  return (
    <main className="settings-screen">
      {items.map(([target, Icon, title, subtitle]) => (
        <button
          className={target === 'settings-delete' ? 'settings-card settings-card--danger' : 'settings-card'}
          type="button"
          key={target}
          onClick={() => onOpen(target)}
        >
          <Icon />
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <ArrowRight />
        </button>
      ))}
    </main>
  );
}

function ProfileSettings({
  restaurant,
  onSave
}: {
  restaurant: Restaurant;
  onSave: (restaurant: Restaurant) => void;
}) {
  const [draft, setDraft] = useState(restaurant);
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError('Название ресторана обязательно.');
      return;
    }
    if (draft.whatsapp && !/^\+?\d{10,15}$/.test(draft.whatsapp)) {
      setError('WhatsApp должен быть в формате +79990000000.');
      return;
    }
    if (draft.instagram_url) {
      try {
        const url = new URL(draft.instagram_url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('invalid');
        }
      } catch {
        setError('Instagram должен быть корректной ссылкой.');
        return;
      }
    }
    onSave({ ...draft, name: draft.name.trim() });
    setError('Сохранено');
  };

  return (
    <main className="settings-screen">
      <form className="settings-form-card" onSubmit={submit}>
        <label>
          Название ресторана
          <input value={draft.name} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          Описание
          <textarea
            maxLength={200}
            value={draft.subtitle}
            onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
          />
          <small>{draft.subtitle.length}/200</small>
        </label>
        <label>
          WhatsApp
          <input
            type="tel"
            value={draft.whatsapp}
            placeholder="+79990000000"
            onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value.replace(/[^\d+]/g, '') })}
          />
        </label>
        <label>
          Instagram
          <input
            type="url"
            value={draft.instagram_url}
            placeholder="https://instagram.com/mangal.rest"
            onChange={(event) => setDraft({ ...draft, instagram_url: event.target.value })}
          />
        </label>
        <label>
          Адрес
          <input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
        </label>
        {error && <p className={error === 'Сохранено' ? 'settings-status' : 'settings-error'}>{error}</p>}
        <button className="primary-wide" type="submit">
          Сохранить изменения
        </button>
      </form>
    </main>
  );
}

function InlineEditor({
  placeholder,
  onAdd
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="inline-editor">
      <input value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)} />
      <button
        type="button"
        onClick={() => {
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue('');
        }}
        aria-label="Добавить"
      >
        <Plus />
      </button>
    </div>
  );
}

function CategoriesSettings({
  categories,
  tags,
  onChangeCategories,
  onChangeTags
}: {
  categories: Category[];
  tags: CatalogTag[];
  onChangeCategories: (categories: Category[]) => void;
  onChangeTags: (tags: CatalogTag[]) => void;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= categories.length) return;
    const next = [...categories];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChangeCategories(next);
  };

  return (
    <main className="settings-screen">
      <section className="settings-form-card">
        <div className="settings-section-head">
          <h2>Категории</h2>
        </div>
        <InlineEditor
          placeholder="Новая категория"
          onAdd={(name) =>
            onChangeCategories([
              ...categories,
              {
                id: makeId('category'),
                name,
                icon: 'flame',
                kind: 'food',
                image: demoCategories[0]?.image ?? ''
              }
            ])
          }
        />
        <div className="settings-list">
          {categories.map((category, index) => (
            <article className="settings-list-item" key={category.id}>
              <GripVertical />
              <input
                value={category.name}
                onChange={(event) =>
                  onChangeCategories(categories.map((item) => (item.id === category.id ? { ...item, name: event.target.value } : item)))
                }
              />
              <button type="button" onClick={() => move(index, -1)} aria-label="Выше">
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} aria-label="Ниже">
                ↓
              </button>
              <button className="danger-icon" type="button" onClick={() => onChangeCategories(categories.filter((item) => item.id !== category.id))} aria-label="Удалить">
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-form-card">
        <div className="settings-section-head">
          <h2>Метки (теги)</h2>
        </div>
        <InlineEditor
          placeholder="Новая метка"
          onAdd={(name) => onChangeTags([...tags, { id: makeId('tag'), name, icon: '⭐', color: '#f59e0b' }])}
        />
        <div className="settings-list">
          {tags.map((tag) => (
            <article className="settings-list-item settings-list-item--tag" key={tag.id}>
              <input
                value={tag.icon}
                aria-label="Иконка"
                onChange={(event) => onChangeTags(tags.map((item) => (item.id === tag.id ? { ...item, icon: event.target.value } : item)))}
              />
              <input
                value={tag.name}
                onChange={(event) => onChangeTags(tags.map((item) => (item.id === tag.id ? { ...item, name: event.target.value } : item)))}
              />
              <input
                type="color"
                value={tag.color}
                aria-label="Цвет"
                onChange={(event) => onChangeTags(tags.map((item) => (item.id === tag.id ? { ...item, color: event.target.value } : item)))}
              />
              <button className="danger-icon" type="button" onClick={() => onChangeTags(tags.filter((item) => item.id !== tag.id))} aria-label="Удалить">
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ColorSetting({
  label,
  value,
  palette,
  onChange
}: {
  label: string;
  value: string;
  palette: string[];
  onChange: (color: string) => void;
}) {
  return (
    <div className="color-setting">
      <div className="color-setting__head">
        <h2>{label}</h2>
        <label>
          <span style={{ background: value }} />
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        </label>
      </div>
      <div className="swatches">
        {palette.map((color) => (
          <button
            className={value.toLowerCase() === color.toLowerCase() ? 'swatch is-active' : 'swatch'}
            style={{ background: color }}
            type="button"
            key={color}
            onClick={() => onChange(color)}
            aria-label={color}
          />
        ))}
      </div>
    </div>
  );
}

function DesignSettings({ theme, onChange }: { theme: ThemeSettings; onChange: (patch: Partial<ThemeSettings>) => void }) {
  const primaryColors = ['#e8a23a', '#3b82f6', '#16a34a', '#ef4444', '#a855f7', '#111827'];
  const accentColors = ['#ffd082', '#f59e0b', '#f97316', '#ec4899', '#06b6d4', '#84cc16'];
  const backgroundColors = ['#070809', '#101419', '#f7f3ec', '#f8fafc', '#fff7ed', '#f1f5f9'];
  const cardColors = ['#121416', '#1f2937', '#ffffff', '#fffaf0', '#f8fafc', '#0f172a'];
  const textColors = ['#f8f5ef', '#ffffff', '#181510', '#111827', '#292524', '#0f172a'];
  const mutedColors = ['#aaa39a', '#cbd5e1', '#766d62', '#64748b', '#57534e', '#475569'];
  const titleColors = ['#f8f5ef', '#ffffff', '#111827', '#181510', '#e8a23a', '#f97316'];

  return (
    <main className="settings-screen">
      <section className="settings-form-card">
        <h2>Тема</h2>
        <div className="choice-grid">
          <button
            className={theme.background_color === '#f7f3ec' ? 'choice-card is-active' : 'choice-card'}
            type="button"
            onClick={() =>
              onChange({
                background_color: '#f7f3ec',
                card_color: '#ffffff',
                text_primary: '#181510',
                text_secondary: '#766d62',
                product_title_color: '#111827',
                category_title_color: '#ffffff'
              })
            }
          >
            Светлая
          </button>
          <button
            className={theme.background_color !== '#f7f3ec' ? 'choice-card is-active' : 'choice-card'}
            type="button"
            onClick={() =>
              onChange({
                background_color: '#070809',
                card_color: '#121416',
                text_primary: '#f8f5ef',
                text_secondary: '#aaa39a',
                product_title_color: '#f8f5ef',
                category_title_color: '#f8f5ef'
              })
            }
          >
            Тёмная
          </button>
        </div>

        <ColorSetting label="Фон приложения" value={theme.background_color} palette={backgroundColors} onChange={(color) => onChange({ background_color: color })} />
        <ColorSetting label="Основной цвет" value={theme.accent_color} palette={primaryColors} onChange={(color) => onChange({ accent_color: color })} />
        <ColorSetting label="Цвет акцента" value={theme.accent_secondary} palette={accentColors} onChange={(color) => onChange({ accent_secondary: color })} />
        <ColorSetting label="Цвет карточек" value={theme.card_color} palette={cardColors} onChange={(color) => onChange({ card_color: color })} />
        <ColorSetting label="Цвет текста" value={theme.text_primary} palette={textColors} onChange={(color) => onChange({ text_primary: color })} />
        <ColorSetting label="Вторичный текст" value={theme.text_secondary} palette={mutedColors} onChange={(color) => onChange({ text_secondary: color })} />
        <ColorSetting label="Текст внутри карточек блюд" value={theme.product_title_color ?? theme.text_primary} palette={titleColors} onChange={(color) => onChange({ product_title_color: color })} />
        <ColorSetting label="Названия категорий" value={theme.category_title_color ?? theme.text_primary} palette={titleColors} onChange={(color) => onChange({ category_title_color: color })} />

        <label className="range-field">
          <span>Скругление <b>{theme.card_radius}px</b></span>
          <input type="range" min="0" max="24" value={Math.min(theme.card_radius, 24)} onChange={(event) => onChange({ card_radius: Number(event.target.value), button_radius: Math.max(8, Number(event.target.value) - 2) })} />
        </label>

        <button className="primary-wide" type="button">
          Сохранить изменения
        </button>
      </section>
    </main>
  );
}

function BackupSettings({
  restaurant,
  categories,
  tags,
  products,
  theme,
  onImport
}: {
  restaurant: Restaurant;
  categories: Category[];
  tags: CatalogTag[];
  products: Product[];
  theme: ThemeSettings;
  onImport: (payload: { restaurant?: Restaurant; categories?: Category[]; tags?: CatalogTag[]; products?: Product[]; design?: CatalogDesignExport; theme?: ThemeSettings }) => void;
}) {
  const exportCatalog = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            restaurant,
            categories,
            tags,
            products,
            design: {
              theme: theme.background_color === '#f7f3ec' ? 'light' : 'dark',
              backgroundColor: theme.background_color,
              primaryColor: theme.accent_color,
              accentColor: theme.accent_secondary,
              cardColor: theme.card_color,
              cardStyle: theme.card_color === '#ffffff' ? 'light' : 'dark',
              textColor: theme.text_primary,
              mutedTextColor: theme.text_secondary,
              productTitleColor: theme.product_title_color,
              categoryTitleColor: theme.category_title_color,
              radius: theme.card_radius
            }
          },
          null,
          2
        )
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mangal-catalog.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="settings-screen">
      <section className="settings-form-card backup-card">
        <h2>Экспорт каталога</h2>
        <p>Сохраните резервную копию каталога в файл.</p>
        <button className="primary-wide" type="button" onClick={exportCatalog}>
          <Download /> Экспортировать каталог
        </button>
      </section>
      <section className="settings-form-card backup-card">
        <h2>Импорт каталога</h2>
        <p>Загрузите JSON файл. Текущие данные будут заменены.</p>
        <label className="ghost-wide import-file">
          <CloudUpload /> Выбрать файл
          <input
            type="file"
            accept="application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              onImport(JSON.parse(await file.text()));
              event.target.value = '';
            }}
          />
        </label>
      </section>
      <section className="settings-info">
        <strong>Информация</strong>
        <p>Формат: JSON. Рекомендуем делать бэкап перед импортом.</p>
      </section>
    </main>
  );
}

function DeleteSettings({ onCancel, onDelete }: { onCancel: () => void; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <main className="delete-screen">
      <div className="delete-icon">
        <Trash2 />
      </div>
      <h2>Удалить весь каталог?</h2>
      <p>Будут удалены блюда, категории, метки и настройки. Это действие нельзя отменить.</p>
      {armed && <strong>Нажмите ещё раз, чтобы подтвердить удаление.</strong>}
      <div className="delete-actions">
        <button
          className="danger-wide"
          type="button"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            onDelete();
          }}
        >
          Удалить каталог
        </button>
        <button className="ghost-wide" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </main>
  );
}

function DesignEditor({
  editingProduct,
  categories,
  products,
  restaurant,
  onSaveProduct,
  onCloseProduct,
  onUpdateRestaurant,
  onImport,
  cartCount,
  onNavigate
}: {
  editingProduct: Product | null;
  categories: Category[];
  products: Product[];
  restaurant: Restaurant;
  onSaveProduct: (product: Product) => void;
  onCloseProduct: () => void;
  onUpdateRestaurant: (patch: Partial<Restaurant>) => void;
  onImport: (payload: { restaurant?: Restaurant; products?: Product[]; theme?: ThemeSettings }) => void;
  cartCount: number;
  onNavigate: (target: 'home' | 'catalog' | 'drinks' | 'cabins' | 'profile') => void;
}) {
  const editor = useAdminStore((state) => state.editor);
  const setEditor = useAdminStore((state) => state.setEditor);
  const theme = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);

  if (!editor) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className={editor === 'dish' ? 'design-editor design-editor--dish' : 'design-editor'}>
        {editor === 'dish' ? (
          <DishEditorPage
            product={editingProduct}
            categories={categories}
            cartCount={cartCount}
            onBack={() => {
              onCloseProduct();
              setEditor(null);
            }}
            onSave={onSaveProduct}
            onNavigate={(target) => {
              onNavigate(target);
              if (target !== 'profile') {
                onCloseProduct();
                setEditor(null);
              }
            }}
          />
        ) : (
          <>
            <div className="editor-head">
              <h2>{editor === 'design' ? 'Редактор дизайна' : editor === 'settings' ? 'Настройки' : 'Категории'}</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  onCloseProduct();
                  setEditor(null);
                }}
              >
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
            <label>
              Стиль кнопок
              <select value={theme.button_style} onChange={(event) => updateTheme({ button_style: event.target.value as ThemeSettings['button_style'] })}>
                <option value="filled">Заливка</option>
                <option value="outline">Обводка</option>
              </select>
            </label>
          </div>
        ) : editor === 'settings' ? (
          <div className="theme-form">
            <label>
              Название ресторана
              <input value={restaurant.name} onChange={(event) => onUpdateRestaurant({ name: event.target.value })} />
            </label>
            <label>
              WhatsApp для заказов
              <input value={restaurant.whatsapp} onChange={(event) => onUpdateRestaurant({ whatsapp: event.target.value.replace(/\D/g, '') })} placeholder="79990000000" />
            </label>
            <label>
              Instagram
              <input value={restaurant.instagram_url} onChange={(event) => onUpdateRestaurant({ instagram_url: event.target.value })} placeholder="https://instagram.com/..." />
            </label>
            <label>
              Адрес
              <input value={restaurant.address} onChange={(event) => onUpdateRestaurant({ address: event.target.value })} />
            </label>
            <div className="import-export">
              <button
                className="ghost-wide"
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ restaurant, products, theme }, null, 2)], {
                    type: 'application/json'
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'mangal-catalog-export.json';
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Экспорт JSON
              </button>
              <label className="ghost-wide import-file">
                Импорт JSON
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    const payload = JSON.parse(await file.text()) as {
                      restaurant?: Restaurant;
                      products?: Product[];
                      theme?: ThemeSettings;
                    };
                    onImport(payload);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="admin-placeholder">
            <p>Категории готовы к Supabase-таблице category. Сейчас они используются как шаблон для карточек и фильтров.</p>
            <ul>
              {categories.map((category) => (
                <li key={category.id}>{category.name}</li>
              ))}
            </ul>
          </div>
        )}
          </>
        )}
      </section>
    </div>
  );
}

function AppContent() {
  const { data } = useQuery({ queryKey: ['catalog'], queryFn: loadCatalog });
  const themeStore = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);
  const setAdminEditor = useAdminStore((state) => state.setEditor);
  const [screen, setScreen] = useState<Screen>('home');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [localProducts, setLocalProducts] = useState<Product[]>(demoProducts);
  const [localCategories, setLocalCategories] = useState<Category[]>(demoCategories);
  const [localTags, setLocalTags] = useState<CatalogTag[]>(defaultTags);
  const [localRestaurant, setLocalRestaurant] = useState<Restaurant>(demoRestaurant);
  const items = useCartStore((state) => state.items);
  const cartCount = selectCartCount(items);

  useEffect(() => {
    if (data?.theme) {
      updateTheme(data.theme);
    }
    if (data?.products) {
      setLocalProducts(data.products);
    }
    if (data?.categories) {
      setLocalCategories(data.categories);
    }
    if (data?.restaurant) {
      setLocalRestaurant(data.restaurant);
    }
  }, [data?.categories, data?.products, data?.restaurant, data?.theme, updateTheme]);

  const catalog = {
    categories: localCategories,
    products: localProducts,
    restaurant: localRestaurant,
    source: data?.source ?? ('demo' as const)
  };

  const title = useMemo(() => {
    if (screen === 'catalog') return 'Все товары';
    if (screen === 'drinks') return 'Напитки';
    if (screen === 'checkout') return 'Оформление заказа';
    return undefined;
  }, [screen]);

  const settingsTitle = useMemo(() => {
    if (screen === 'settings-profile') return 'Профиль ресторана';
    if (screen === 'settings-categories') return 'Параметры и категории';
    if (screen === 'settings-design') return 'Дизайн приложения';
    if (screen === 'settings-backup') return 'Импорт и экспорт';
    if (screen === 'settings-delete') return 'Удаление каталога';
    return 'Настройки';
  }, [screen]);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setScreen('product');
  };

  const editProduct = (product: Product) => {
    setEditingProduct(product);
    setAdminEditor('dish');
  };

  const saveProduct = (product: Product) => {
    setLocalProducts((current) => {
      const exists = current.some((item) => item.id === product.id);
      return exists ? current.map((item) => (item.id === product.id ? product : item)) : [product, ...current];
    });
    if (selectedProduct?.id === product.id) {
      setSelectedProduct(product);
    }
    setEditingProduct(null);
    setAdminEditor(null);
  };

  const deleteProduct = (productId: string) => {
    setLocalProducts((current) => current.filter((product) => product.id !== productId));
    if (selectedProduct?.id === productId) {
      setSelectedProduct(null);
      setScreen('home');
    }
  };

  const toggleProduct = (productId: string, key: ProductFlag) => {
    setLocalProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, [key]: !product[key] } : product
      )
    );
  };

  const goCheckout = () => {
    if (!hasDrinkInCart(items) && screen !== 'drinks') {
      setShowReminder(true);
      return;
    }
    setScreen('checkout');
  };

  const resetCatalog = () => {
    setLocalProducts([]);
    setLocalCategories([]);
    setLocalTags([]);
    setLocalRestaurant({ ...demoRestaurant, name: 'Мангал', subtitle: '', whatsapp: '', instagram_url: '', address: '' });
    updateTheme({
      background_type: 'color',
      background_color: '#070809',
      background_image_url: '',
      card_color: '#121416',
      card_radius: 16,
      card_shadow: '0 22px 70px rgba(0, 0, 0, 0.32)',
      text_primary: '#f8f5ef',
      text_secondary: '#aaa39a',
      product_title_color: '#f8f5ef',
      category_title_color: '#f8f5ef',
      accent_color: '#e8a23a',
      accent_secondary: '#ffd082',
      button_style: 'filled',
      button_radius: 14,
      header_style: 'centered'
    });
    setScreen('settings');
  };

  const renderSettings = () => (
    <>
      <SettingsHeader
        title={settingsTitle}
        onBack={() => {
          if (screen === 'settings') {
            setScreen('home');
            return;
          }
          setScreen('settings');
        }}
      />
      {screen === 'settings' && <SettingsHome onOpen={setScreen} />}
      {screen === 'settings-profile' && (
        <ProfileSettings restaurant={catalog.restaurant} onSave={(restaurant) => setLocalRestaurant(restaurant)} />
      )}
      {screen === 'settings-categories' && (
        <CategoriesSettings
          categories={catalog.categories}
          tags={localTags}
          onChangeCategories={setLocalCategories}
          onChangeTags={setLocalTags}
        />
      )}
      {screen === 'settings-design' && <DesignSettings theme={themeStore} onChange={updateTheme} />}
      {screen === 'settings-backup' && (
        <BackupSettings
          restaurant={catalog.restaurant}
          categories={catalog.categories}
          tags={localTags}
          products={catalog.products}
          theme={themeStore}
          onImport={(payload) => {
            if (payload.products) setLocalProducts(payload.products);
            if (payload.categories) setLocalCategories(payload.categories);
            if (payload.tags) setLocalTags(payload.tags);
            if (payload.restaurant) setLocalRestaurant(payload.restaurant);
            if (payload.theme) updateTheme(payload.theme);
            if (payload.design) {
              updateTheme({
                background_color: payload.design.backgroundColor ?? (payload.design.theme === 'light' ? '#f7f3ec' : '#070809'),
                card_color: payload.design.cardColor ?? (payload.design.cardStyle === 'light' ? '#ffffff' : '#121416'),
                accent_color: payload.design.primaryColor ?? themeStore.accent_color,
                accent_secondary: payload.design.accentColor ?? themeStore.accent_secondary,
                text_primary: payload.design.textColor ?? themeStore.text_primary,
                text_secondary: payload.design.mutedTextColor ?? themeStore.text_secondary,
                product_title_color: payload.design.productTitleColor ?? themeStore.product_title_color,
                category_title_color: payload.design.categoryTitleColor ?? themeStore.category_title_color,
                card_radius: payload.design.radius ?? themeStore.card_radius
              });
            }
          }}
        />
      )}
      {screen === 'settings-delete' && <DeleteSettings onCancel={() => setScreen('settings')} onDelete={resetCatalog} />}
    </>
  );

  return (
    <div className="app-shell" style={applyTheme(themeStore)}>
      {screen.startsWith('settings') ? (
        renderSettings()
      ) : (
        <>
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
              restaurant={catalog.restaurant}
              categories={catalog.categories}
              products={catalog.products}
              onOpenCatalog={(categoryId = 'all') => {
                setCatalogCategory(categoryId);
                setScreen('catalog');
              }}
              onOpenDrinks={() => setScreen('drinks')}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
            />
          )}
          {screen === 'catalog' && (
            <CatalogScreen
              categories={catalog.categories}
              products={catalog.products}
              initialCategory={catalogCategory}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
            />
          )}
          {screen === 'drinks' && (
            <DrinksScreen
              products={catalog.products}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
            />
          )}
          {screen === 'product' && selectedProduct && <ProductScreen product={selectedProduct} products={catalog.products} />}
          {screen === 'checkout' && <CheckoutScreen products={catalog.products} restaurant={catalog.restaurant} />}
          <CartBar onCheckout={goCheckout} />
        </>
      )}

      <AdminPanel onAdd={() => setAdminEditor('dish')} onSettings={() => setScreen('settings')} />
      <DesignEditor
        editingProduct={editingProduct}
        categories={catalog.categories}
        products={catalog.products}
        restaurant={catalog.restaurant}
        onSaveProduct={saveProduct}
        onCloseProduct={() => setEditingProduct(null)}
        onUpdateRestaurant={(patch) => setLocalRestaurant((current) => ({ ...current, ...patch }))}
        onImport={(payload) => {
          if (payload.products) {
            setLocalProducts(payload.products);
          }
          if (payload.restaurant) {
            setLocalRestaurant(payload.restaurant);
          }
          if (payload.theme) {
            updateTheme(payload.theme);
          }
        }}
        cartCount={cartCount}
        onNavigate={(target) => {
          if (target === 'home') {
            setScreen('home');
          }
          if (target === 'catalog') {
            setCatalogCategory('all');
            setScreen('catalog');
          }
          if (target === 'drinks') {
            setScreen('drinks');
          }
          if (target === 'cabins') {
            setScreen('checkout');
          }
          if (target === 'profile') {
            setScreen('settings-profile');
          }
          setAdminEditor(null);
        }}
      />
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => setScreen('settings')}
        />
      )}
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
