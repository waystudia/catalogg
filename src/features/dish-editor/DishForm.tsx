import { useEffect, useState, type FormEvent } from 'react';
import { CategorySelector } from './CategorySelector';
import { PhotoUploader } from './PhotoUploader';
import { QuantityInput } from './QuantityInput';
import { TagsSelector } from './TagsSelector';
import type { Category, Product } from '../../entities/models';
import type { Dish } from './types';

const serveOptions = ['с луком', 'с соусом', 'с гарниром', 'без добавок'];

function NumericInput({
  value,
  required,
  onChange
}: {
  value: number;
  required?: boolean;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(String(value));
    }
  }, [focused, value]);

  return (
    <input
      inputMode="numeric"
      min={0}
      required={required}
      type="number"
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (text.trim() === '') {
          setText('0');
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onChange(next.trim() === '' ? 0 : Number(next));
      }}
    />
  );
}

export function DishForm({
  dish,
  categories,
  products,
  error,
  onChange,
  onSubmit
}: {
  dish: Dish;
  categories: Category[];
  products: Product[];
  error: string;
  onChange: (patch: Partial<Dish>) => void;
  onSubmit: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="dish-form" onSubmit={submit}>
      {error && <p className="dish-alert">{error}</p>}
      <PhotoUploader images={dish.images} onChange={(images) => onChange({ images })} />

      <section className="dish-section">
        <div className="dish-two-fields dish-two-fields--title">
          <label>
            Название
            <input
              maxLength={80}
              required
              value={dish.name}
              onChange={(event) => onChange({ name: event.target.value.slice(0, 80) })}
              placeholder="Шашлык из баранины"
            />
          </label>
          <label>
            Цена
            <span>
              <NumericInput required value={dish.price} onChange={(price) => onChange({ price })} />
              ₽
            </span>
          </label>
        </div>
      </section>

      <CategorySelector categories={categories} value={dish.categories} onChange={(categories) => onChange({ categories })} />
      <TagsSelector tags={dish.tags} onChange={(tags) => onChange({ tags })} />

      <section className="dish-section">
        <label>
          Описание
          <textarea
            maxLength={500}
            value={dish.description}
            onChange={(event) => onChange({ description: event.target.value.slice(0, 500) })}
            placeholder="Короткое описание без форматирования"
          />
        </label>
        <small>{dish.description.length}/500</small>
      </section>

      <section className="dish-section">
        <label>
          Состав
          <input
            maxLength={200}
            value={dish.ingredients}
            onChange={(event) => onChange({ ingredients: event.target.value.slice(0, 200) })}
            placeholder="Баранина, специи, лук, соль"
          />
        </label>
      </section>

      <QuantityInput
        weight={dish.weight}
        dailyQuantity={dish.dailyQuantity}
        unlimitedQuantity={dish.unlimitedQuantity}
        onWeightChange={(weight) => onChange({ weight })}
        onQuantityChange={(dailyQuantity) => onChange({ dailyQuantity })}
        onUnlimitedChange={(unlimitedQuantity) => onChange({ unlimitedQuantity })}
      />

      <section className="dish-section">
        <label>
          Подается с
          <input
            list="serve-options"
            maxLength={120}
            value={dish.serveWith}
            onChange={(event) => onChange({ serveWith: event.target.value.slice(0, 120) })}
            placeholder="с луком и соусом"
          />
          <datalist id="serve-options">
            {serveOptions.map((option) => (
              <option value={option} key={option} />
            ))}
          </datalist>
        </label>
      </section>

      <section className="dish-section dish-choice-editor">
        <div>
          <h3>Выбор варианта</h3>
          <small>Покупатель сможет выбрать только один вариант.</small>
        </div>
        <div className="dish-choice-editor__list">
          {dish.choiceOptions.map((option, index) => (
            <div className="dish-choice-editor__row" key={index}>
              <span aria-hidden="true" />
              <label>
                <span>Вариант</span>
                <input
                  aria-label={`Название варианта ${index + 1}`}
                  maxLength={40}
                  value={option.name}
                  onChange={(event) => {
                    const next = [...dish.choiceOptions];
                    next[index] = { ...option, name: event.target.value.slice(0, 40) };
                    onChange({ choiceOptions: next });
                  }}
                  placeholder={index === 0 ? 'Средняя' : 'Большая'}
                />
              </label>
              <label className="dish-choice-editor__price">
                <span>Цена</span>
                <input
                  aria-label={`Цена варианта ${index + 1}`}
                  inputMode="numeric"
                  min="0"
                  type="number"
                  value={option.price || ''}
                  onChange={(event) => {
                    const next = [...dish.choiceOptions];
                    next[index] = { ...option, price: Math.max(0, Number(event.target.value) || 0) };
                    onChange({ choiceOptions: next });
                  }}
                />
                <b>₽</b>
              </label>
              <button
                type="button"
                aria-label={`Удалить вариант ${option.name || index + 1}`}
                onClick={() => onChange({ choiceOptions: dish.choiceOptions.filter((_, itemIndex) => itemIndex !== index) })}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        {dish.choiceOptions.length < 6 && (
          <button
            className="dish-choice-editor__add"
            type="button"
            onClick={() => onChange({ choiceOptions: [...dish.choiceOptions, { name: '', price: dish.price }] })}
          >
            + Добавить вариант
          </button>
        )}
      </section>

      <section className="dish-section">
        <h3>Часто покупают вместе</h3>
        <div className="dish-pair-picker">
          {products
            .filter((product) => product.id !== dish.id)
            .map((product) => {
              const selected = dish.pairIds.includes(product.id);
              return (
                <button
                  className={selected ? 'dish-pair-option is-active' : 'dish-pair-option'}
                  type="button"
                  key={product.id}
                  onClick={() =>
                    onChange({
                      pairIds: selected
                        ? dish.pairIds.filter((id) => id !== product.id)
                        : [...dish.pairIds, product.id]
                    })
                  }
                >
                  <img src={product.image_url} alt="" />
                  <span>{product.title}</span>
                  <b>{selected ? 'Добавлено' : 'Добавить'}</b>
                </button>
              );
            })}
        </div>
      </section>

      <section className="dish-section">
        <h3>Переключатели</h3>
        <div className="dish-switches">
          {['Новинка', 'Популярное'].map((tag) => (
            <label className="dish-switch" key={tag}>
              {tag}
              <input
                type="checkbox"
                checked={dish.tags.includes(tag)}
                onChange={(event) => {
                  onChange({
                    tags: event.target.checked
                      ? [...dish.tags.filter((item) => item !== tag), tag]
                      : dish.tags.filter((item) => item !== tag)
                  });
                }}
              />
              <span />
            </label>
          ))}
        </div>
      </section>
    </form>
  );
}
