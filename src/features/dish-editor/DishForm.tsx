import { CheckCircle2, LoaderCircle, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { CategorySelector } from './CategorySelector';
import { PhotoUploader } from './PhotoUploader';
import { QuantityInput } from './QuantityInput';
import { TagsSelector } from './TagsSelector';
import type { Category, Product, ProductModifierGroup } from '../../entities/models';
import type { Dish } from './types';
import type { BusinessType } from '../../shared/businessTerminology';
import { isValidGlobalBarcode } from '../../entities/sharedProducts';
import { lookupSharedProductByBarcode } from '../../shared/api/sharedProductCatalogApi';

const serveOptions = ['с луком', 'с соусом', 'с гарниром', 'без добавок'];

const coffeeModifierPresets: Record<string, string[]> = {
  'Объём': ['200 мл', '300 мл', '400 мл'],
  'Температура': ['Горячий', 'Тёплый', 'Холодный'],
  'Молоко': ['Обычное', 'Безлактозное', 'Кокосовое', 'Миндальное', 'Овсяное'],
  'Сироп': ['Без сиропа', 'Карамель', 'Ваниль', 'Фундук', 'Кокос', 'Шоколад', 'Банан', 'Фисташка'],
  'Дополнительно': ['Дополнительный шот эспрессо', 'Взбитые сливки', 'Маршмеллоу', 'Корица', 'Какао', 'Лёд'],
  'Сахар': ['Без сахара', '1 порция', '2 порции', '3 порции']
};

const confectioneryModifierPresets: Record<string, string[]> = {
  'Начинка': ['Медовик', 'Красный бархат', 'Шоколад-вишня', 'Фисташка-малина', 'Сникерс', 'Ваниль-клубника'],
  'Декор': ['Без дополнительного декора', 'Ягоды', 'Шоколадный декор', 'Минималистичный декор', 'Тематический декор'],
  'Упаковка': ['Стандартная', 'Подарочная', 'С лентой']
};

const makeModifierGroup = (name: string, presets: Record<string, string[]>): ProductModifierGroup => ({
  id: crypto.randomUUID(),
  name,
  required: ['Объём', 'Начинка', 'Декор'].includes(name),
  minSelected: ['Объём', 'Начинка', 'Декор'].includes(name) ? 1 : 0,
  maxSelected: name === 'Дополнительно' ? 6 : 1,
  isActive: true,
  options: (presets[name] ?? ['Новый вариант']).map((optionName, index) => ({
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
  const [sharedLookupState, setSharedLookupState] = useState<'idle' | 'loading' | 'found' | 'missing' | 'error'>('idle');
  const [sharedLookupMessage, setSharedLookupMessage] = useState('');
  const [pairCategory, setPairCategory] = useState('all');
  const pairProducts = products.filter((product) => product.id !== dish.id);
  const pairCategories = categories.filter((category) =>
    pairProducts.some((product) =>
      (product.category_ids?.length ? product.category_ids : [product.category_id]).includes(category.id)
    )
  );
  const visiblePairProducts = pairCategory === 'all'
    ? pairProducts
    : pairProducts.filter((product) =>
      (product.category_ids?.length ? product.category_ids : [product.category_id]).includes(pairCategory)
    );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const lookupBarcode = async () => {
    if (!isValidGlobalBarcode(dish.barcode)) {
      setSharedLookupState('error');
      setSharedLookupMessage('Проверьте цифры штрих‑кода. Контрольная сумма не совпадает.');
      return;
    }

    setSharedLookupState('loading');
    setSharedLookupMessage('');
    try {
      const sharedProduct = await lookupSharedProductByBarcode(dish.barcode);
      if (!sharedProduct) {
        setSharedLookupState('missing');
        setSharedLookupMessage('Товара пока нет в общей базе. После заполнения его можно будет предложить для всех магазинов.');
        return;
      }

      const localCategory = categories.find(
        (category) => category.name.trim().toLocaleLowerCase('ru') === sharedProduct.categoryName?.trim().toLocaleLowerCase('ru')
      );
      const weightInGrams = sharedProduct.netContentValue && sharedProduct.netContentUnit
        ? sharedProduct.netContentUnit === 'kg'
          ? Math.round(sharedProduct.netContentValue * 1000)
          : sharedProduct.netContentUnit === 'g'
            ? Math.round(sharedProduct.netContentValue)
            : dish.weight
        : dish.weight;

      onChange({
        name: sharedProduct.title,
        description: sharedProduct.description ?? '',
        ingredients: sharedProduct.ingredients ?? '',
        allergens: sharedProduct.allergens.join(', '),
        weight: weightInGrams,
        images: sharedProduct.imageUrl ? [sharedProduct.imageUrl] : dish.images,
        categories: localCategory ? [localCategory.id] : dish.categories,
        masterProductId: sharedProduct.id,
        masterContentVersion: sharedProduct.version,
        contentSource: 'master'
      });
      setSharedLookupState('found');
      setSharedLookupMessage(
        `${sharedProduct.categoryName ?? 'Общая категория'} · ${sharedProduct.status === 'verified' ? 'карточка проверена' : 'ожидает модерации'}`
      );
    } catch {
      setSharedLookupState('error');
      setSharedLookupMessage('Общая база пока недоступна. Товар можно заполнить вручную.');
    }
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
            {businessType === 'grocery' && dish.saleUnit === 'weight' ? 'Цена за 1 кг' : 'Цена'}
            <span>
              <NumericInput required value={dish.price} onChange={(price) => onChange({ price })} />
              ₽
            </span>
          </label>
        </div>
      </section>

      <CategorySelector categories={categories} value={dish.categories} onChange={(categories) => onChange({ categories })} />
      <TagsSelector tags={dish.tags} onChange={(tags) => onChange({ tags })} />

      {businessType === 'confectionery' && (
        <section className="dish-section">
          <h3>Цена и заказ</h3>
          <div className="dish-two-fields">
            <label>
              Тип цены
              <select value={dish.pricingType} onChange={(event) => onChange({ pricingType: event.target.value as Dish['pricingType'] })}>
                <option value="fixed">Фиксированная</option>
                <option value="from">Цена «от»</option>
                <option value="per_kg">За килограмм</option>
                <option value="variant">По варианту</option>
              </select>
            </label>
            <label>
              Ценовой сегмент
              <select value={dish.priceTier} onChange={(event) => onChange({ priceTier: event.target.value as Dish['priceTier'] })}>
                <option value="budget">Бюджетный</option>
                <option value="standard">Стандарт</option>
                <option value="premium">Премиум</option>
              </select>
            </label>
          </div>
          {dish.pricingType === 'per_kg' && (
            <div className="dish-two-fields">
              <label>Минимальный вес, кг<input type="number" min="0.5" step="0.5" value={dish.minimumWeight} onChange={(event) => onChange({ minimumWeight: Math.max(0.5, Number(event.target.value) || 0.5) })} /></label>
              <label>Шаг веса, кг<input type="number" min="0.1" step="0.1" value={dish.weightStep} onChange={(event) => onChange({ weightStep: Math.max(0.1, Number(event.target.value) || 0.1) })} /></label>
            </div>
          )}
          <label>Предзаказ, часов<input type="number" min="0" max="720" value={dish.advanceOrderHours} onChange={(event) => onChange({ advanceOrderHours: Math.max(0, Number(event.target.value) || 0) })} /></label>
          <div className="dish-switches">
            <label className="dish-switch">Надпись<input type="checkbox" checked={dish.allowInscription} onChange={(event) => onChange({ allowInscription: event.target.checked })} /><span /></label>
            <label className="dish-switch">Комментарий к декору<input type="checkbox" checked={dish.allowDecorationComment} onChange={(event) => onChange({ allowDecorationComment: event.target.checked })} /><span /></label>
            <label className="dish-switch">Дата и время<input type="checkbox" checked={dish.allowProductionSchedule} onChange={(event) => onChange({ allowProductionSchedule: event.target.checked })} /><span /></label>
          </div>
        </section>
      )}

      {businessType === 'grocery' && (
        <section className="dish-section">
          <h3>Учёт товара</h3>
          <div className="dish-two-fields">
            <label>
              Артикул SKU
              <input
                maxLength={64}
                value={dish.sku}
                onChange={(event) => onChange({ sku: event.target.value.slice(0, 64) })}
                placeholder="DATES-MEDJOUL"
              />
            </label>
            <label>
              Штрихкод
              <span className="dish-barcode-field">
                <input
                  inputMode="numeric"
                  maxLength={32}
                  value={dish.barcode}
                  onChange={(event) => {
                    onChange({
                      barcode: event.target.value.replace(/\s/g, '').slice(0, 32),
                      masterProductId: undefined,
                      masterContentVersion: undefined,
                      contentSource: undefined
                    });
                    setSharedLookupState('idle');
                    setSharedLookupMessage('');
                  }}
                  placeholder="4601234567890"
                />
                <button
                  type="button"
                  disabled={!dish.barcode.trim() || sharedLookupState === 'loading'}
                  onClick={() => void lookupBarcode()}
                >
                  {sharedLookupState === 'loading' ? <LoaderCircle className="is-spinning" /> : <Search />}
                  Найти в общей базе
                </button>
              </span>
            </label>
          </div>
          {sharedLookupMessage && (
            <p className={`dish-shared-lookup dish-shared-lookup--${sharedLookupState}`}>
              {sharedLookupState === 'found' ? <CheckCircle2 /> : <TriangleAlert />}
              <span>{sharedLookupMessage}</span>
            </p>
          )}
          <label>
            Тип продажи
            <select
              value={dish.saleUnit}
              onChange={(event) => {
                const saleUnit = event.target.value as Dish['saleUnit'];
                onChange({ saleUnit, pricingType: saleUnit === 'weight' ? 'per_kg' : 'fixed' });
              }}
            >
              <option value="piece">Штучный товар</option>
              <option value="weight">Весовой товар</option>
            </select>
          </label>
          {dish.saleUnit === 'weight' && (
            <div className="dish-two-fields">
              <label>
                Минимальный вес, кг
                <input
                  type="number"
                  min="0.05"
                  step="0.05"
                  value={dish.minimumWeight}
                  onChange={(event) => onChange({ minimumWeight: Math.max(0.05, Number(event.target.value) || 0.05) })}
                />
              </label>
              <label>
                Шаг веса, кг
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={dish.weightStep}
                  onChange={(event) => onChange({ weightStep: Math.max(0.01, Number(event.target.value) || 0.01) })}
                />
              </label>
            </div>
          )}
          <label className="dish-switch">
            Разрешить замену товара
            <input
              type="checkbox"
              checked={dish.allowSubstitution}
              onChange={(event) => onChange({ allowSubstitution: event.target.checked })}
            />
            <span />
          </label>
        </section>
      )}

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

      {(businessType === 'coffee_shop' || businessType === 'confectionery') && (
        <section className="dish-section dish-choice-editor dish-modifier-editor">
          <div>
            <h3>{businessType === 'coffee_shop' ? 'Варианты напитка' : 'Модификаторы товара'}</h3>
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
            {Object.keys(businessType === 'coffee_shop' ? coffeeModifierPresets : confectioneryModifierPresets).filter((name) => !dish.modifierGroups.some((group) => group.name === name)).map((name) => (
              <button type="button" key={name} onClick={() => {
                const presets = businessType === 'coffee_shop' ? coffeeModifierPresets : confectioneryModifierPresets;
                onChange({ modifierGroups: [...dish.modifierGroups, makeModifierGroup(name, presets)] });
              }}>+ {name}</button>
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
        {businessType === 'confectionery' && (
          <label>
            Аллергены
            <input maxLength={200} value={dish.allergens} onChange={(event) => onChange({ allergens: event.target.value.slice(0, 200) })} placeholder="глютен, яйца, молочные продукты" />
          </label>
        )}
      </section>

      <QuantityInput
        businessType={businessType}
        saleUnit={dish.saleUnit}
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
        <label className="dish-switch dish-choice-cards-toggle">
          <div>
            <strong>Отдельные карточки</strong>
            <small>Например: «Пицца Маргарита большая» или «Крылышки, 6 шт».</small>
          </div>
          <input
            aria-label="Добавить варианты в каталог отдельными карточками"
            type="checkbox"
            checked={dish.publishChoiceCards}
            disabled={dish.choiceOptions.length === 0}
            onChange={(event) => onChange({
              publishChoiceCards: event.target.checked,
              choiceCardOptions: event.target.checked && dish.choiceCardOptions.length === 0
                ? ['']
                : dish.choiceCardOptions
            })}
          />
          <span aria-hidden="true" />
        </label>
        {dish.publishChoiceCards && (
          <div className="dish-choice-card-options">
            <div>
              <h4>Дополнительные варианты карточек</h4>
              <small>Например: «острая» и «оригинальная». Каждая комбинация появится отдельной карточкой.</small>
            </div>
            {dish.choiceCardOptions.map((option, index) => (
              <div className="dish-choice-card-options__row" key={index}>
                <label>
                  <span>Вариант</span>
                  <input
                    aria-label={`Дополнительный вариант ${index + 1}`}
                    maxLength={40}
                    value={option}
                    onChange={(event) => {
                      const next = [...dish.choiceCardOptions];
                      next[index] = event.target.value.slice(0, 40);
                      onChange({ choiceCardOptions: next });
                    }}
                    placeholder={index === 0 ? 'Острая' : 'Оригинальная'}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Удалить дополнительный вариант ${option || index + 1}`}
                  onClick={() => onChange({
                    choiceCardOptions: dish.choiceCardOptions.filter((_, itemIndex) => itemIndex !== index)
                  })}
                >
                  Удалить
                </button>
              </div>
            ))}
            {dish.choiceCardOptions.length < 6 && (
              <button
                className="dish-choice-editor__add"
                type="button"
                aria-label="Добавить дополнительный вариант"
                onClick={() => onChange({ choiceCardOptions: [...dish.choiceCardOptions, ''] })}
              >
                + Добавить вариант карточки
              </button>
            )}
          </div>
        )}
      </section>

      <section className="dish-section">
        <h3>Часто покупают вместе</h3>
        <nav className="dish-pair-categories" aria-label="Категории сопутствующих блюд">
          <button
            className={pairCategory === 'all' ? 'is-active' : ''}
            type="button"
            onClick={() => setPairCategory('all')}
          >
            Все
          </button>
          {pairCategories.map((category) => (
            <button
              className={pairCategory === category.id ? 'is-active' : ''}
              type="button"
              key={category.id}
              onClick={() => setPairCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </nav>
        <div className="dish-pair-picker">
          {visiblePairProducts
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
