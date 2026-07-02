import { Camera, LogIn, MapPin, Search, Store, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

const restaurants = [
  { name: 'Мангал', slug: 'mangal', description: 'Шашлык, блюда на углях, зал и самовывоз' },
  { name: 'Rizih', slug: 'rizih', description: 'Сеть ресторанов, суши, пицца и доставка' }
];

const categories = ['Суши', 'Шашлык', 'Пицца', 'Фастфуд', 'Напитки'];

export function Home() {
  return (
    <main style={styles.shell}>
      <section style={styles.hero}>
        <div style={styles.city}>
          <MapPin />
          <span>Грозный</span>
        </div>
        <h1 style={styles.title}>WayCatalog</h1>
        <p style={styles.subtitle}>Выберите ресторан, войдите в кабинет или продолжите как клиент.</p>
      </section>

      <section style={styles.panel}>
        <label style={styles.searchLabel}>
          <Search />
          <input style={styles.searchInput} type="search" placeholder="Найти ресторан или категорию" />
        </label>

        <div style={styles.categories} aria-label="Категории">
          {categories.map((category) => <button style={styles.categoryButton} type="button" key={category}>{category}</button>)}
        </div>

        <div style={styles.list} aria-label="Рестораны">
          {restaurants.map((restaurant) => (
            <Link key={restaurant.slug} style={styles.restaurantLink} to={`/${restaurant.slug}`}>
              <span style={styles.restaurantIcon}><Store /></span>
              <span>
                <strong style={styles.restaurantName}>{restaurant.name}</strong>
                <small style={styles.restaurantDescription}>{restaurant.description}</small>
              </span>
              <span style={styles.restaurantSlug}>/{restaurant.slug}</span>
            </Link>
          ))}
        </div>

        <div style={styles.actions}>
          <Link style={styles.primaryButton} to="/login"><LogIn />Войти</Link>
          <Link style={styles.secondaryButton} to="/admin/clients/new"><UserPlus />Регистрация</Link>
          <Link style={styles.secondaryButton} to="/scanner"><Camera />Сканер</Link>
          <Link style={styles.ghostButton} to="/mangal">Пропустить</Link>
        </div>
      </section>
    </main>
  );
}

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'grid',
    alignContent: 'center',
    gap: 22,
    padding: '32px 18px',
    background: '#f6f7fb',
    color: '#111827'
  },
  hero: {
    width: 'min(100%, 760px)',
    display: 'grid',
    gap: 10,
    margin: '0 auto'
  },
  city: {
    display: 'inline-flex',
    width: 'fit-content',
    minHeight: 34,
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    padding: '0 12px',
    background: '#ffffff',
    color: '#5b3df4',
    fontWeight: 900
  },
  title: {
    margin: 0,
    fontSize: 46,
    lineHeight: 1,
    fontWeight: 900
  },
  subtitle: {
    maxWidth: 520,
    margin: 0,
    color: '#667085',
    fontSize: 17
  },
  panel: {
    width: 'min(100%, 760px)',
    display: 'grid',
    gap: 16,
    margin: '0 auto'
  },
  searchLabel: {
    display: 'flex',
    minHeight: 52,
    alignItems: 'center',
    gap: 10,
    border: '1px solid #d8dee9',
    borderRadius: 8,
    padding: '0 14px',
    background: '#ffffff',
    color: '#667085'
  },
  searchInput: {
    width: '100%',
    border: 0,
    background: '#ffffff',
    color: '#111827',
    font: 'inherit',
    outline: 'none'
  },
  categories: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto'
  },
  categoryButton: {
    minHeight: 38,
    flex: '0 0 auto',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '0 14px',
    background: '#ffffff',
    color: '#344054',
    font: 'inherit',
    fontWeight: 800
  },
  list: {
    display: 'grid',
    gap: 10
  },
  restaurantLink: {
    display: 'grid',
    gridTemplateColumns: '44px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 14,
    minHeight: 76,
    padding: '14px 16px',
    border: '1px solid #e1e5ec',
    borderRadius: 8,
    background: '#ffffff',
    color: '#111827'
  },
  restaurantIcon: {
    display: 'grid',
    width: 44,
    height: 44,
    placeItems: 'center',
    borderRadius: 8,
    background: '#f0edff',
    color: '#5b3df4'
  },
  restaurantName: {
    display: 'block',
    fontSize: 18
  },
  restaurantDescription: {
    display: 'block',
    marginTop: 4,
    color: '#6b7280',
    fontSize: 13
  },
  restaurantSlug: {
    flex: '0 0 auto',
    color: '#4f46e5',
    fontSize: 14,
    fontWeight: 800
  },
  actions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10
  },
  primaryButton: {
    display: 'inline-flex',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: 0,
    borderRadius: 8,
    background: '#111827',
    color: '#ffffff',
    fontWeight: 900
  },
  secondaryButton: {
    display: 'inline-flex',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    border: '1px solid #cfd6e2',
    borderRadius: 8,
    background: '#ffffff',
    color: '#111827',
    fontWeight: 900
  },
  ghostButton: {
    display: 'inline-flex',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid transparent',
    borderRadius: 8,
    background: 'transparent',
    color: '#4b5563',
    fontWeight: 900
  }
} satisfies Record<string, React.CSSProperties>;
