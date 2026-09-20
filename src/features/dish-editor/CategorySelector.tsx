import { Beef, Coffee, Flame, Pizza, Soup } from 'lucide-react';
import type { Category } from '../../entities/models';

const categoryIcons = {
  grill: Flame,
  chechen: Soup,
  pizza: Pizza,
  fastfood: Beef,
  fridge: Coffee,
  lemonades: Coffee,
  tea: Coffee
};

export function CategorySelector({
  categories,
  value,
  onChange
}: {
  categories: Category[];
  value: string[];
  onChange: (categories: string[]) => void;
}) {
  const toggle = (categoryId: string) => {
    if (value.includes(categoryId)) {
      onChange(value.filter((id) => id !== categoryId));
      return;
    }
    onChange([...value, categoryId]);
  };

  return (
    <details className="dish-section dish-disclosure">
      <summary><span>Категории</span><small>{value.length > 0 ? `Выбрано: ${value.length}` : 'Не выбраны'}</small></summary>
      <div className="dish-category-chips">
        {categories.map((category) => {
          const Icon = categoryIcons[category.id as keyof typeof categoryIcons] ?? Soup;
          return (
            <button
              className={value.includes(category.id) ? 'dish-chip is-active' : 'dish-chip'}
              type="button"
              key={category.id}
              onClick={() => toggle(category.id)}
            >
              <Icon />
              {category.name}
            </button>
          );
        })}
      </div>
    </details>
  );
}
