import { useEffect, useState, type FormEvent } from 'react';
import { CategorySelector } from './CategorySelector';
import { PhotoUploader } from './PhotoUploader';
import { QuantityInput } from './QuantityInput';
import { TagsSelector } from './TagsSelector';
import type { Category, Product, ProductModifierGroup } from '../../entities/models';
import type { Dish } from './types';
import type { BusinessType } from '../../shared/businessTerminology';

const serveOptions = ['с луком', 'с соусом', 'с гарниром', 'без добавок'];

const coffeeModifierPresets: Record<string, string[]> = {
  'Объём': ['200 мл', '300 мл', '400 мл'],
  'Температура': ['Горячий', 'Тёплый', 'Холодный'],
  'Молоко': ['Обычное', 'Безлактозное', 'Кокосовое', 'Миндальное', 'Овсяное'],
  'Сироп': ['Без сиропа', 'Карамель', 'Ваниль', 'Фундук', 'Кокос', 'Шоколад', 'Банан', 'Фисташка'],
  'Дополнительно': ['Дополнительный шот эспрессо', 'Взбитые сливки', 'Маршмеллоу', 'Корица', 'Какао', 'Лёд'],
  'Сахар': ['Без сахара', '1 порция', '2 порции', '3 порции']
};

const makeModifierGroup = (name: string): ProductModifierGroup => ({
  id: crypto.randomUUID(),
  name,
  required: name === 'Объём',
  minSelected: name === 'Объём' ? 1 : 0,
  maxSelected: name === 'Дополнительно' ? 6 : 1,
  isActive: true,
  options: (coffeeModifierPresets[name] ?? ['Новый вариант']).map((optionName, index) => ({
    id: crypto.randomUUID(),
    name: optionName,
    priceDelta: 0,
    isDefault: index === 0,
    isActive: true
  }))
});

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
  onSubmit,
  businessType = 'restaurant'
}: {
  dish: Dish;
  categories: Category[];
  products: Product[];
  error: string;
  onChange: (patch: Partial<Dish>) => void;
  onSubmit: () => void;
  businessType?: BusinessType;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="dish-form" onSubmit={submit}>
      {error && <p className="dish-alert">{error}</p>}
      <PhotoUploader images={dish.images} businessType={businessType} onChange={(images) => onChange({ images })} />

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

      {businessType === 'coffee_shop' && (
        <section className="dish-section dish-choice-editor dish-modifier-editor">
          <div>
            <h3>Варианты напитка</h3>
            <small>Группы можно менять, скрывать или удалить. Доплата прибавляется к базовой цене.</small>
          </div>
          {dish.modifierGroups.map((group, groupIndex) => (
            <div className="dish-modifier-editor__group" key={group.id}>
              <div className="dish-modifier-editor__head">
                <input
                  aria-label={`Название группы ${groupIndex + 1}`}
                  value={group.name}
                  onChange={(event) => {
                    const next = [...dish.modifierGroups];
                    next[groupIndex] = { ...group, name: event.target.value.slice(0, 40) };
                    onChange({ modifierGroups: next });
                  }}
                />
                <label><input type="checkbox" checked={group.required} onChange={(event) => {
                  const next = [...dish.modifierGroups];
                  next[groupIndex] = { ...group, required: event.target.checked, minSelected: event.target.checked ? 1 : 0 };
                  onChange({ modifierGroups: next });
                }} /> Обязательный выбор</label>
                <label><input type="checkbox" checked={group.maxSelected > 1} onChange={(event) => {
                  const next = [...dish.modifierGroups];
                  next[groupIndex] = { ...group, maxSelected: event.target.checked ? Math.max(2, group.options.length) : 1 };
                  onChange({ modifierGroups: next });
                }} /> Несколько вариантов</label>
                <label><input type="checkbox" checked={group.isActive !== false} onChange={(event) => {
                  const next = [...dish.modifierGroups];
                  next[groupIndex] = { ...group, isActive: event.target.checked };
                  onChange({ modifierGroups: next });
                }} /> Показывать</label>
                <button type="button" onClick={() => onChange({ modifierGroups: dish.modifierGroups.filter((_, index) => index !== groupIndex) })}>Удалить группу</button>
              </div>
              {group.options.map((option, optionIndex) => (
                <div className="dish-choice-editor__row" key={option.id}>
                  <label><span>Вариант</span><input value={option.name} onChange={(event) => {
                    const next = [...dish.modifierGroups];
                    const options = [...group.options];
                    options[optionIndex] = { ...option, name: event.target.value.slice(0, 50) };
                    next[groupIndex] = { ...group, options };
                    onChange({ modifierGroups: next });
                  }} /></label>
                  <label className="dish-choice-editor__price"><span>Доплата</span><input type="number" min="0" value={option.priceDelta || ''} onChange={(event) => {
                    const next = [...dish.modifierGroups];
                    const options = [...group.options];
                    options[optionIndex] = { ...option, priceDelta: Math.max(0, Number(event.target.value) || 0) };
                    next[groupIndex] = { ...group, options };
                    onChange({ modifierGroups: next });
                  }} /><b>₽</b></label>
                  <label><input type="checkbox" checked={option.isActive !== false} onChange={(event) => {
                    const next = [...dish.modifierGroups];
                    const options = [...group.options];
                    options[optionIndex] = { ...option, isActive: event.target.checked };
                    next[groupIndex] = { ...group, options };
                    onChange({ modifierGroups: next });
                  }} /> Видим</label>
                  <button type="button" onClick={() => {
                    const next = [...dish.modifierGroups];
                    next[groupIndex] = { ...group, options: group.options.filter((_, index) => index !== optionIndex) };
                    onChange({ modifierGroups: next });
                  }}>Удалить</button>
                </div>
              ))}
              <button className="dish-choice-editor__add" type="button" onClick={() => {
                const next = [...dish.modifierGroups];
                next[groupIndex] = { ...group, options: [...group.options, { id: crypto.randomUUID(), name: '', priceDelta: 0, isDefault: false, isActive: true }] };
                onChange({ modifierGroups: next });
              }}>+ Добавить вариант</button>
            </div>
          ))}
          <div className="dish-modifier-editor__presets">
            {Object.keys(coffeeModifierPresets).filter((name) => !dish.modifierGroups.some((group) => group.name === name)).map((name) => (
              <button type="button" key={name} onClick={() => onChange({ modifierGroups: [...dish.modifierGroups, makeModifierGroup(name)] })}>+ {name}</button>
            ))}
          </div>
        </section>
      )}

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
        businessType={businessType}
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
