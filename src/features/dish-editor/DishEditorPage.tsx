import { ArrowLeft, ShoppingCart, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Category, Product } from '../../entities/models';
import { saveDishDraft } from './storage';
import { dishToProduct, productToDish, type Dish } from './types';
import { DishForm } from './DishForm';

function validateDish(dish: Dish) {
  if (dish.images.length === 0) return 'Добавьте минимум одно фото.';
  if (!dish.name.trim()) return 'Введите название блюда.';
  if (dish.price < 0 || Number.isNaN(dish.price)) return 'Введите корректную цену.';
  if (dish.categories.length === 0) return 'Выберите минимум одну категорию.';
  if (!dish.unlimitedQuantity && (dish.dailyQuantity < 0 || !Number.isInteger(dish.dailyQuantity))) {
    return 'Количество должно быть целым числом.';
  }
  return '';
}

export function DishEditorPage({
  product,
  categories,
  products,
  cartCount,
  onBack,
  onSave,
  onNavigate
}: {
  product: Product | null;
  categories: Category[];
  products: Product[];
  cartCount: number;
  onBack: () => void;
  onSave: (product: Product) => void;
  onNavigate: (target: 'home' | 'catalog' | 'drinks' | 'cabins' | 'profile') => void;
}) {
  const foodCategories = useMemo(() => categories.filter((category) => category.kind !== 'space'), [categories]);
  const [dish, setDish] = useState<Dish>(() => productToDish(product, foodCategories[0]?.id ?? 'chechen'));
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [error, setError] = useState('');
  const title = product ? 'Редактировать блюдо' : 'Добавить блюдо';

  const updateDish = (patch: Partial<Dish>) => setDish((current) => ({ ...current, ...patch }));

  const save = async () => {
    const validationError = validateDish(dish);
    if (validationError) {
      setError(validationError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setStatus('loading');
    setError('');

    try {
      await saveDishDraft(dish);
      onSave(dishToProduct(dish, product));
      setStatus('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setError('Не удалось сохранить. Попробуйте еще раз.');
      setStatus('idle');
    }
  };

  return (
    <div className="dish-editor-page">
      <header className="dish-editor-header">
        <button type="button" onClick={onBack} aria-label="Назад">
          <ArrowLeft />
        </button>
        <h2>{title}</h2>
        <div>
          <button type="button" onClick={() => onNavigate('profile')} aria-label="Профиль">
            <User />
          </button>
          <button type="button" aria-label="Корзина">
            <ShoppingCart />
            {cartCount > 0 && <span>{cartCount}</span>}
          </button>
        </div>
      </header>

      {status === 'loading' && (
        <div className="dish-skeleton">
          <span />
          <span />
          <span />
        </div>
      )}
      {status === 'success' && <p className="dish-toast">Сохранено</p>}

      <DishForm
        dish={dish}
        categories={foodCategories}
        products={products}
        error={error}
        onChange={updateDish}
        onSubmit={() => void save()}
      />

      <footer className="dish-actions">
        <button className="dish-cancel" type="button" onClick={onBack}>
          Отмена
        </button>
        <button className="dish-save" type="button" onClick={() => void save()}>
          Сохранить изменения
        </button>
      </footer>
    </div>
  );
}
