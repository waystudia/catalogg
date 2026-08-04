import {
  ArrowRight,
  Beef,
  ChefHat,
  CloudUpload,
  Drumstick,
  Edit3,
  Fish,
  Flame,
  GripVertical,
  Ham,
  Info,
  Link2,
  Pizza,
  Plus,
  Salad,
  Sandwich,
  Soup,
  Store,
  Tags,
  Trash2,
  Utensils,
  UtensilsCrossed,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { categories as demoCategories } from '../../data/catalog';
import type { Cabin, CatalogTag, Category, Product } from '../../entities/models';
import { imageFileToDataUrl } from '../../shared/images';
import { SafeImage } from '../../shared/SafeImage';
import {
  createCabinDraft,
  defaultCabinMeta,
  makeCabinFeature,
  parseCabinMeta,
  withDefaultRestaurantTables,
  type CabinMeta
} from './catalogAdminModel';

type SettingsCatalogTab = 'tags' | 'cabins' | 'categories';
type CategoryEditorMode = 'list' | 'edit' | 'add';
type CabinEditorMode = 'list' | 'edit' | 'add';

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const getProductCategoryIds = (product: Product) =>
  product.category_ids?.length ? product.category_ids : [product.category_id];
const isProductInCategory = (product: Product, categoryId: string) =>
  getProductCategoryIds(product).includes(categoryId);
const createCategoryDraft = (name = 'Новая категория'): Category => {
  const id = makeId('category');
  return {
    id,
    slug: id,
    name,
    icon: 'flame',
    kind: 'food',
    showOnHome: true,
    showInOrderFlow: false,
    image: demoCategories[0]?.image ?? ''
  };
};
const createTagDraft = (name = 'Новая метка'): CatalogTag => {
  const id = makeId('tag');
  return { id, slug: id, name, icon: '#', color: '#7c3aed' };
};
const categoryIconOptions = [
  { id: 'flame', label: 'Огонь', Icon: Flame },
  { id: 'pot', label: 'Кухня', Icon: ChefHat },
  { id: 'utensils', label: 'Общее меню', Icon: Utensils },
  { id: 'chechen', label: 'Жижиг галнаш', Icon: UtensilsCrossed },
  { id: 'pizza', label: 'Пицца', Icon: Pizza },
  { id: 'burger', label: 'Бургер', Icon: Beef },
  { id: 'shawarma', label: 'Шаурма', Icon: Sandwich },
  { id: 'sushi', label: 'Суши', Icon: Fish },
  { id: 'meat', label: 'Мясо', Icon: Ham },
  { id: 'kebab', label: 'Шашлык', Icon: Drumstick },
  { id: 'sauce', label: 'Соусы', Icon: Soup },
  { id: 'salad', label: 'Салаты', Icon: Salad }
];
const isSauceCategory = (category: Category) => {
  const text = `${category.name} ${category.slug ?? ''} ${category.icon}`.toLocaleLowerCase('ru');
  return text.includes('соус') || text.includes('sauce');
};
const isDrinkOrSauceCategory = (category: Category) => category.kind === 'drink' || isSauceCategory(category);

export function CategoriesSettings({
  categories,
  cabins,
  tags,
  products,
  activeTab,
  onTabChange,
  mode,
  editingId,
  cabinMode,
  editingCabinId,
  onCabinModeChange,
  onModeChange,
  onChangeCategories,
  onChangeCabins,
  onChangeTags
}: {
  categories: Category[];
  cabins: Cabin[];
  tags: CatalogTag[];
  products: Product[];
  activeTab: SettingsCatalogTab;
  onTabChange: (tab: SettingsCatalogTab) => void;
  mode: CategoryEditorMode;
  editingId?: string;
  cabinMode: CabinEditorMode;
  editingCabinId?: string;
  onCabinModeChange: (mode: CabinEditorMode, cabinId?: string) => void;
  onModeChange: (mode: CategoryEditorMode, categoryId?: string) => void;
  onChangeCategories: (categories: Category[]) => void;
  onChangeCabins: (cabins: Cabin[]) => void;
  onChangeTags: (tags: CatalogTag[]) => void;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= categories.length) return;
    const next = [...categories];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChangeCategories(next);
  };
  const editingCategory = editingId ? categories.find((category) => category.id === editingId) : undefined;
  const productCountFor = (categoryId: string) =>
    products.filter((product) => isProductInCategory(product, categoryId)).length;
  const statusFor = (category: Category) => {
    if (category.icon === 'flame' || category.icon === 'hot') return { label: 'Популярная', tone: 'popular' };
    if (category.icon === 'pot' || category.icon === 'chef') return { label: 'Новинка', tone: 'new' };
    return { label: 'Обычная', tone: 'default' };
  };
  const saveCategory = (category: Category) => {
    const normalized = {
      ...category,
      name: category.name.trim() || 'Новая категория',
      showOnHome: category.showOnHome !== false,
      showInOrderFlow: category.showInOrderFlow === true
    };
    const exists = categories.some((item) => item.id === normalized.id);
    onChangeCategories(
      exists
        ? categories.map((item) => (item.id === normalized.id ? normalized : item))
        : [...categories, normalized]
    );
    onModeChange('list');
  };
  const displayedCabins = withDefaultRestaurantTables(cabins);
  const moveCabin = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= displayedCabins.length) return;
    const next = [...displayedCabins];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChangeCabins(next);
  };
  const editingCabin = editingCabinId ? displayedCabins.find((cabin) => cabin.id === editingCabinId) : undefined;
  const saveCabin = (cabin: Cabin) => {
    const normalized = {
      ...cabin,
      title: cabin.title.trim() || (parseCabinMeta(cabin.feature).kind === 'table' ? 'Новый столик' : 'Новая кабинка'),
      capacity: cabin.capacity.trim() || '2-4 человека',
      feature: cabin.feature || makeCabinFeature(defaultCabinMeta)
    };
    const exists = displayedCabins.some((item) => item.id === normalized.id);
    onChangeCabins(exists ? displayedCabins.map((item) => (item.id === normalized.id ? normalized : item)) : [...displayedCabins, normalized]);
    onCabinModeChange('list');
  };
  const saveTag = (tag: CatalogTag) => {
    const normalized = {
      ...tag,
      name: tag.name.trim() || 'Новая метка',
      icon: tag.icon.trim() || '#',
      color: tag.color || '#7c3aed'
    };
    const exists = tags.some((item) => item.id === normalized.id);
    onChangeTags(exists ? tags.map((item) => (item.id === normalized.id ? normalized : item)) : [...tags, normalized]);
  };
  const deleteTag = (tagId: string) => {
    onChangeTags(tags.filter((tag) => tag.id !== tagId));
  };

  const tabs = [
    ['tags', Tags, 'Метки'],
    ['cabins', Store, 'Столики и кабинки'],
    ['categories', Tags, 'Категории']
  ] as const;

  const renderTabs = () => (
    <nav className="category-tabs" aria-label="Разделы настроек">
      {tabs.map(([id, Icon, label]) => (
        <button className={activeTab === id ? 'is-active' : ''} type="button" key={id} onClick={() => onTabChange(id)}>
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );

  if (activeTab === 'tags') {
    return (
      <TagsSettingsScreen
        tags={tags}
        onSave={saveTag}
        onDelete={deleteTag}
        renderTabs={renderTabs}
      />
    );
  }

  if (activeTab === 'cabins') {
    if (cabinMode === 'add' || cabinMode === 'edit') {
      return (
        <CabinEditScreen
          cabin={cabinMode === 'edit' ? editingCabin : undefined}
          mode={cabinMode}
          sortIndex={cabinMode === 'edit' && editingCabin ? displayedCabins.findIndex((item) => item.id === editingCabin.id) : displayedCabins.length}
          onCancel={() => onCabinModeChange('list')}
          onMove={cabinMode === 'edit' && editingCabin ? (direction) => moveCabin(displayedCabins.findIndex((item) => item.id === editingCabin.id), direction) : undefined}
          onSave={saveCabin}
        />
      );
    }

    return (
      <main className="settings-screen category-settings-screen">
        {renderTabs()}
        <section className="category-settings-card">
          <div className="category-settings-tip">
            <Info />
            <span>Добавляйте и редактируйте столики и кабинки. Активные места сразу доступны при оформлении заказа в кассе.</span>
          </div>
          <div className="category-list">
            {displayedCabins.map((cabin) => {
              const meta = parseCabinMeta(cabin.feature);
              return (
                <button aria-label={`Редактировать ${cabin.title}`} className="category-list-card cabin-list-card" type="button" key={cabin.id} onClick={() => onCabinModeChange('edit', cabin.id)}>
                  <SafeImage src={cabin.image_url} alt={cabin.title} className="category-list-card__image" />
                  <span className="category-list-card__content">
                    <strong>{cabin.title}</strong>
                    <small className={meta.status === 'active' ? 'cabin-state cabin-state--active' : 'cabin-state'}>
                      <i />
                      {meta.status === 'active' ? 'Активно' : 'Неактивно'}
                    </small>
                    <span className={`cabin-type-badge cabin-type-badge--${meta.type}`}>
                      {meta.kind === 'table' ? 'Столик' : meta.type === 'vip' ? 'VIP' : meta.type === 'premium' ? 'Премиум' : 'Кабинка'}
                    </span>
                    <em>{cabin.capacity}</em>
                    {meta.price > 0 && <em>{meta.price.toLocaleString('ru-RU')} ₽</em>}
                  </span>
                  <ArrowRight className="category-list-card__arrow" />
                </button>
              );
            })}
          </div>
          <button className="category-add-wide" type="button" onClick={() => onCabinModeChange('add')}>
            <Plus />
            Добавить место
          </button>
        </section>
      </main>
    );
  }

  if (mode === 'add' || mode === 'edit') {
    return (
      <CategoryEditScreen
        category={mode === 'edit' ? editingCategory : undefined}
        categories={categories}
        mode={mode}
        tags={tags}
        sortIndex={mode === 'edit' && editingCategory ? categories.findIndex((item) => item.id === editingCategory.id) : categories.length}
        onCancel={() => onModeChange('list')}
        onMove={mode === 'edit' && editingCategory ? (direction) => move(categories.findIndex((item) => item.id === editingCategory.id), direction) : undefined}
        onSave={saveCategory}
      />
    );
  }

  return (
    <main className="settings-screen category-settings-screen">
      {renderTabs()}
      <section className="category-settings-card">
        <div className="category-settings-tip">
          <Info />
          <span>Фото категории лучше загружать широким: 16:9 или около 1.72:1, например 1200 x 700 px.</span>
        </div>
        <div className="category-list">
          {categories.map((category) => (
            <button className="category-list-card" type="button" key={category.id} onClick={() => onModeChange('edit', category.id)}>
              <GripVertical className="category-list-card__drag" />
              <SafeImage src={category.image} alt={category.name} className="category-list-card__image" />
              <span className="category-list-card__content">
                <strong>{category.name}</strong>
                <span className={`category-status-badge category-status-badge--${statusFor(category).tone}`}>
                  {category.icon === 'flame' || category.icon === 'hot' ? <Flame /> : category.icon === 'pot' || category.icon === 'chef' ? <ChefHat /> : <Utensils />}
                  {statusFor(category).label}
                </span>
                <small>
                  <i />
                  {[
                    category.showOnHome !== false ? 'На главной' : '',
                    category.showInOrderFlow === true ? 'Дополнительное' : ''
                  ].filter(Boolean).join(' / ') || 'Скрыта'}
                </small>
                <em>{productCountFor(category.id)} блюд</em>
              </span>
              <ArrowRight className="category-list-card__arrow" />
            </button>
          ))}
        </div>
        <button className="category-add-wide" type="button" onClick={() => onModeChange('add')}>
          <Plus />
          Добавить категорию
        </button>
      </section>
    </main>
  );
}

export function TagsSettingsScreen({
  tags,
  onSave,
  onDelete,
  renderTabs
}: {
  tags: CatalogTag[];
  onSave: (tag: CatalogTag) => void;
  onDelete: (tagId: string) => void;
  renderTabs: () => JSX.Element;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CatalogTag>(() => createTagDraft());
  const editingTag = editingId ? tags.find((tag) => tag.id === editingId) : undefined;

  useEffect(() => {
    if (editingTag) {
      setDraft(editingTag);
      return;
    }
    if (!editingId) {
      setDraft(createTagDraft());
    }
  }, [editingId, editingTag]);

  const resetDraft = () => {
    setEditingId(null);
    setDraft(createTagDraft());
  };

  const saveDraft = () => {
    onSave(draft);
    resetDraft();
  };

  return (
    <main className="settings-screen category-settings-screen">
      {renderTabs()}
      <section className="category-settings-card tag-settings-card">
        <div className="category-settings-tip">
          <Info />
          <span>Метки помогают быстро выделять блюда и категории: хит, новинка, популярное или любой ваш статус.</span>
        </div>

        <div className="tag-edit-panel">
          <label className="tag-edit-field tag-edit-field--name">
            <strong>Название</strong>
            <input
              value={draft.name}
              placeholder="Например: Новинка"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="tag-edit-field tag-edit-field--icon">
            <strong>Иконка</strong>
            <input
              value={draft.icon}
              maxLength={6}
              placeholder="#"
              onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
            />
          </label>
          <label className="tag-edit-field tag-edit-field--color">
            <strong>Цвет</strong>
            <input
              type="color"
              value={draft.color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
              aria-label="Цвет метки"
            />
          </label>
          <button className="tag-save-button" type="button" onClick={saveDraft}>
            {editingId ? 'Сохранить' : 'Добавить'}
          </button>
          {editingId && (
            <button className="tag-cancel-button" type="button" onClick={resetDraft}>
              Отмена
            </button>
          )}
        </div>

        <div className="tag-list">
          {tags.map((tag) => (
            <article className="tag-list-card" key={tag.id}>
              <button className="tag-list-card__main" type="button" onClick={() => setEditingId(tag.id)}>
                <span className="tag-preview" style={{ color: tag.color, backgroundColor: `${tag.color}1a` }}>
                  {tag.icon}
                </span>
                <span>
                  <strong>{tag.name}</strong>
                  <small>{tag.color}</small>
                </span>
              </button>
              <button className="tag-icon-button" type="button" onClick={() => setEditingId(tag.id)} aria-label={`Редактировать ${tag.name}`}>
                <Edit3 />
              </button>
              <button className="tag-icon-button tag-icon-button--danger" type="button" onClick={() => onDelete(tag.id)} aria-label={`Удалить ${tag.name}`}>
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}


function CategoryEditScreen({
  category,
  categories,
  mode,
  tags,
  sortIndex,
  onCancel,
  onMove,
  onSave
}: {
  category?: Category;
  categories: Category[];
  mode: 'edit' | 'add';
  tags: CatalogTag[];
  sortIndex: number;
  onCancel: () => void;
  onMove?: (direction: -1 | 1) => void;
  onSave: (category: Category) => void;
}) {
  const [draft, setDraft] = useState<Category>(() => category ?? createCategoryDraft(''));

  useEffect(() => {
    setDraft(category ?? createCategoryDraft(''));
  }, [category, mode]);

  const selectedTags = tags.slice(0, mode === 'edit' ? 2 : 0);
  const activeAdditionalCategories = categories.filter((item) => item.showInOrderFlow === true);
  const selectedDrinkOrSauceCategories = activeAdditionalCategories.filter(isDrinkOrSauceCategory);
  const currentCategorySelected = draft.showInOrderFlow === true;
  const currentCategoryIsDrinkOrSauce = isDrinkOrSauceCategory(draft);
  const shouldWarnAboutMissingUpsellCategories = currentCategorySelected && selectedDrinkOrSauceCategories.length === 0;
  const additionalCategorySummary = selectedDrinkOrSauceCategories.map((item) => item.name).join(', ');

  return (
    <main className="settings-screen category-edit-screen">
      <section className="category-edit-card">
        <div className="category-edit-field">
          <strong>Изображение категории</strong>
          {draft.image ? (
            <div className="category-edit-image">
              <SafeImage src={draft.image} alt={draft.name || 'Изображение категории'} />
              <button type="button" onClick={() => setDraft({ ...draft, image: '' })} aria-label="Очистить изображение">
                <X />
              </button>
            </div>
          ) : (
            <label className="category-upload-drop">
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
              <Plus />
              <span>Загрузите изображение<br />или перетащите сюда</span>
            </label>
          )}
          <div className="category-edit-actions">
            <label>
              <CloudUpload />
              Загрузить
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
            </label>
            <button type="button" disabled={!draft.image} onClick={() => setDraft({ ...draft, image: '' })}>
              <Trash2 />
              Очистить
            </button>
          </div>
        </div>

        <label className="category-edit-field">
          <strong>Название категории</strong>
          <input
            value={draft.name}
            placeholder="Введите название категории"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>

        <label className="category-edit-field">
          <strong>Ссылка на изображение</strong>
          <span className="category-edit-url">
            <Link2 />
            <input
              value={draft.image}
              placeholder="Вставьте ссылку на изображение"
              onChange={(event) => setDraft({ ...draft, image: event.target.value })}
            />
          </span>
        </label>

        <div className="category-edit-field">
          <strong>Иконки категории</strong>
          <div className="category-edit-icons">
            {categoryIconOptions.slice(0, 12).map(({ id, label, Icon }) => (
              <button
                className={draft.icon === id ? 'is-active' : ''}
                type="button"
                key={id}
                title={label}
                aria-label={label}
                onClick={() => setDraft({ ...draft, icon: id })}
              >
                <Icon />
              </button>
            ))}
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Статус</strong>
          <div className="category-status-options">
            {[
              ['flame', 'Популярная'],
              ['pot', 'Новинка'],
              ['utensils', 'Обычная']
            ].map(([icon, label]) => (
              <button
                className={draft.icon === icon ? 'is-active' : ''}
                type="button"
                key={icon}
                onClick={() => setDraft({ ...draft, icon })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Отображение категории</strong>
          <label className="category-edit-radio">
            <input
              type="checkbox"
              checked={draft.showOnHome !== false}
              onChange={(event) => setDraft({ ...draft, showOnHome: event.target.checked })}
            />
            На главной
          </label>
          <label className="category-edit-radio">
            <input
              type="checkbox"
              checked={draft.showInOrderFlow === true}
              onChange={(event) => setDraft({ ...draft, showInOrderFlow: event.target.checked })}
            />
            Дополнительное
          </label>
          {currentCategorySelected && (
            <div className={shouldWarnAboutMissingUpsellCategories ? 'category-settings-tip category-settings-tip--warning' : 'category-settings-tip category-settings-tip--success'}>
              <Info />
              <span>
                {shouldWarnAboutMissingUpsellCategories
                  ? 'Категория отмечена как дополнительная, но среди дополнительных пока нет напитков или соусов. Панель допродажи клиенту не покажет эти группы, пока вы не отметите хотя бы одну такую категорию.'
                  : currentCategoryIsDrinkOrSauce
                    ? `Эта категория будет участвовать в панели допродажи. Сейчас выбраны: ${additionalCategorySummary}.`
                    : `Панель допродажи активна. Сейчас в ней участвуют категории: ${additionalCategorySummary}.`}
              </span>
            </div>
          )}
        </div>

        <div className="category-edit-field">
          <strong>Метки</strong>
          <div className="category-edit-tags">
            {selectedTags.map((tag) => (
              <span key={tag.id}>
                {tag.name}
                <X />
              </span>
            ))}
            <button type="button">
              <Plus />
              Добавить метку
            </button>
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Порядок сортировки</strong>
          <div className="category-sort-row">
            <button type="button" onClick={() => onMove?.(-1)} disabled={!onMove}>
              ↑
            </button>
            <button type="button" onClick={() => onMove?.(1)} disabled={!onMove}>
              ↓
            </button>
            <input value={sortIndex < 0 ? 0 : sortIndex} readOnly aria-label="Порядок сортировки" />
          </div>
        </div>

        <label className="category-edit-field">
          <strong>Описание</strong>
          <textarea placeholder="Описание категории" />
        </label>

        <button className="category-save-button" type="button" onClick={() => onSave(draft)}>
          {mode === 'add' ? 'Добавить категорию' : 'Сохранить изменения'}
        </button>
        <button className="category-cancel-button" type="button" onClick={onCancel}>
          Отмена
        </button>
      </section>
    </main>
  );
}

function CabinEditScreen({
  cabin,
  mode,
  sortIndex,
  onCancel,
  onMove,
  onSave
}: {
  cabin?: Cabin;
  mode: 'edit' | 'add';
  sortIndex: number;
  onCancel: () => void;
  onMove?: (direction: -1 | 1) => void;
  onSave: (cabin: Cabin) => void;
}) {
  const [draft, setDraft] = useState<Cabin>(() => cabin ?? createCabinDraft());

  useEffect(() => {
    setDraft(cabin ?? createCabinDraft());
  }, [cabin, mode]);

  const meta = parseCabinMeta(draft.feature);
  const placeLabel = meta.kind === 'table' ? 'столика' : 'кабинки';
  const updateMeta = (patch: Partial<CabinMeta>) => {
    setDraft((current) => ({
      ...current,
      feature: makeCabinFeature({ ...parseCabinMeta(current.feature), ...patch })
    }));
  };

  return (
    <main className="settings-screen category-edit-screen">
      <section className="category-edit-card">
        <div className="category-edit-field">
          <strong>Фото {placeLabel}</strong>
          {draft.image_url ? (
            <div className="category-edit-image">
              <SafeImage src={draft.image_url} alt={draft.title || `Фото ${placeLabel}`} />
              <button type="button" onClick={() => setDraft({ ...draft, image_url: '' })} aria-label="Очистить фото">
                <X />
              </button>
            </div>
          ) : (
            <label className="category-upload-drop">
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image_url: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
              <Plus />
              <span>Загрузите изображение<br />или перетащите сюда</span>
            </label>
          )}
          <div className="category-edit-actions">
            <label>
              <CloudUpload />
              Загрузить
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image_url: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
            </label>
            <button type="button" disabled={!draft.image_url} onClick={() => setDraft({ ...draft, image_url: '' })}>
              <Trash2 />
              Очистить
            </button>
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Тип места</strong>
          <div className="category-status-options">
            <button className={meta.kind === 'table' ? 'is-active' : ''} type="button" onClick={() => updateMeta({ kind: 'table' })}>
              Столик
            </button>
            <button className={meta.kind === 'cabin' ? 'is-active' : ''} type="button" onClick={() => updateMeta({ kind: 'cabin' })}>
              Кабинка
            </button>
          </div>
        </div>

        <label className="category-edit-field">
          <strong>Название {placeLabel}</strong>
          <input
            aria-label="Название места"
            value={draft.title}
            placeholder={meta.kind === 'table' ? 'Стол 2' : 'Кабинка 2'}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>

        <label className="category-edit-field">
          <strong>Вместимость</strong>
          <input
            value={draft.capacity}
            placeholder="8-10 человек"
            onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
          />
        </label>

        <label className="category-edit-field">
          <strong>Цена {placeLabel}, ₽</strong>
          <input
            aria-label={`Цена ${placeLabel}`}
            type="number"
            min="0"
            step="1"
            value={meta.price || ''}
            placeholder="0 — бесплатно"
            onChange={(event) => updateMeta({ price: Math.max(0, Number(event.target.value) || 0) })}
          />
        </label>

        <div className="category-edit-field">
          <strong>Статус</strong>
          <div className="category-status-options">
            <button className={meta.status === 'active' ? 'is-active' : ''} type="button" onClick={() => updateMeta({ status: 'active' })}>
              Активна
            </button>
            <button className={meta.status === 'inactive' ? 'is-active' : ''} type="button" onClick={() => updateMeta({ status: 'inactive' })}>
              Неактивна
            </button>
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Категория места</strong>
          <div className="category-status-options">
            {[
              ['normal', 'Обычная'],
              ['vip', 'VIP'],
              ['premium', 'Премиум']
            ].map(([type, label]) => (
              <button className={meta.type === type ? 'is-active' : ''} type="button" key={type} onClick={() => updateMeta({ type: type as CabinMeta['type'] })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Порядок сортировки</strong>
          <div className="category-sort-row">
            <button type="button" onClick={() => onMove?.(-1)} disabled={!onMove}>
              ↑
            </button>
            <button type="button" onClick={() => onMove?.(1)} disabled={!onMove}>
              ↓
            </button>
            <input value={sortIndex < 0 ? 0 : sortIndex} readOnly aria-label="Порядок сортировки" />
          </div>
        </div>

        <button className="category-save-button" type="button" onClick={() => onSave(draft)}>
          {mode === 'add' ? 'Добавить место' : 'Сохранить изменения'}
        </button>
        <button className="category-cancel-button" type="button" onClick={onCancel}>
          Отмена
        </button>
      </section>
    </main>
  );
}
