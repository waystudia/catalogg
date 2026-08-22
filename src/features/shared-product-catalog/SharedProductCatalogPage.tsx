import {
  Barcode,
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  Paintbrush,
  PackagePlus,
  Plus,
  Search,
  Store,
  Tags
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { SharedProduct } from '../../entities/sharedProducts';
import {
  findSharedProductByBarcode,
  isValidGlobalBarcode,
  normalizeGlobalBarcode
} from '../../entities/sharedProducts';
import {
  addSharedProductsToCatalog,
  createSharedProductCategory,
  listMasterCategories,
  lookupSharedProductByBarcode,
  searchSharedProducts,
  submitSharedProduct,
  uploadSharedProductImage,
  type MasterCategory
} from '../../shared/api/sharedProductCatalogApi';
import { SharedBarcodeScanner } from './SharedBarcodeScanner';
import { prepareBarcodeScanSound } from '../grocery-operations/barcodeScanFeedback';
import {
  removeProductPhotoBackground,
  preloadProductPhotoBackgroundRemoval,
  refineProductPhotoBackground,
  type ProductPhotoProcessor,
  type ProductPhotoRefiner
} from './productPhotoBackground';
import { ProductPhotoRefinementEditor } from './ProductPhotoRefinementEditor';
import { ProductPhotoCamera } from './ProductPhotoCamera';
import './shared-product-catalog.css';

export type SharedProductCatalogMode = 'platform' | 'merchant';

const demoCategories: MasterCategory[] = [
  { id: 'demo-drinks', parentId: null, name: 'Напитки' },
  { id: 'demo-grocery', parentId: null, name: 'Бакалея' },
  { id: 'demo-snacks', parentId: null, name: 'Снеки' }
];

const demoProducts: SharedProduct[] = [{
  id: 'demo-coca-cola-500',
  title: 'Coca-Cola Original Taste',
  brand: 'Coca-Cola',
  description: 'Газированный безалкогольный напиток',
  ingredients: null,
  allergens: [],
  countryOfOrigin: null,
  netContentValue: 500,
  netContentUnit: 'ml',
  categoryId: 'demo-drinks',
  categoryName: 'Напитки',
  barcode: '5449000054227',
  normalizedBarcode: '05449000054227',
  imageUrl: null,
  version: 1,
  status: 'verified'
}];

type ProductDraft = {
  barcode: string;
  title: string;
  categoryId: string;
  description: string;
  imageFile: File | null;
};

const emptyDraft = (categoryId = ''): ProductDraft => ({
  barcode: '',
  title: '',
  categoryId,
  description: '',
  imageFile: null
});

type PhotoProcessingStatus = 'idle' | 'processing' | 'ready' | 'error';

const useObjectUrl = (file: File | null) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
};

export function SharedProductCatalogPage({
  mode,
  catalogId = null,
  demo = false,
  photoProcessor = removeProductPhotoBackground,
  photoPreloader = preloadProductPhotoBackgroundRemoval,
  photoRefiner = refineProductPhotoBackground,
  photoProcessingTimeoutMs = 45_000
}: {
  mode: SharedProductCatalogMode;
  catalogId?: string | null;
  demo?: boolean;
  photoProcessor?: ProductPhotoProcessor;
  photoPreloader?: () => Promise<void>;
  photoRefiner?: ProductPhotoRefiner;
  photoProcessingTimeoutMs?: number;
}) {
  const [products, setProducts] = useState<SharedProduct[]>(demo ? demoProducts : []);
  const [categories, setCategories] = useState<MasterCategory[]>(demo ? demoCategories : []);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [draft, setDraft] = useState<ProductDraft>(() => emptyDraft(demoCategories[0]?.id));
  const [formOpen, setFormOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [originalPhoto, setOriginalPhoto] = useState<File | null>(null);
  const [processedPhoto, setProcessedPhoto] = useState<File | null>(null);
  const [photoStatus, setPhotoStatus] = useState<PhotoProcessingStatus>('idle');
  const [photoProgress, setPhotoProgress] = useState(0);
  const [photoChoice, setPhotoChoice] = useState<'original' | 'processed'>('original');
  const [photoError, setPhotoError] = useState('');
  const [photoRefinementOpen, setPhotoRefinementOpen] = useState(false);
  const [photoCameraOpen, setPhotoCameraOpen] = useState(false);
  const [captureWizardActive, setCaptureWizardActive] = useState(false);
  const [photoRefinementMessage, setPhotoRefinementMessage] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoRequestRef = useRef(0);
  const originalPhotoUrl = useObjectUrl(originalPhoto);
  const processedPhotoUrl = useObjectUrl(processedPhoto);

  const warmUpPhotoProcessor = () => {
    void photoPreloader().catch(() => undefined);
  };

  const resetPhoto = () => {
    photoRequestRef.current += 1;
    setOriginalPhoto(null);
    setProcessedPhoto(null);
    setPhotoStatus('idle');
    setPhotoProgress(0);
    setPhotoChoice('original');
    setPhotoError('');
    setPhotoRefinementOpen(false);
    setPhotoCameraOpen(false);
    setPhotoRefinementMessage('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const selectOriginalPhoto = () => {
    if (!originalPhoto) return;
    setPhotoChoice('original');
    setDraft((current) => ({ ...current, imageFile: originalPhoto }));
  };

  const selectProcessedPhoto = () => {
    if (!processedPhoto) return;
    setPhotoChoice('processed');
    setDraft((current) => ({ ...current, imageFile: processedPhoto }));
  };

  const chooseAnotherPhoto = () => {
    if (!photoInputRef.current) return;
    photoInputRef.current.value = '';
    photoInputRef.current.click();
  };

  const continueWithOriginalPhoto = () => {
    if (!originalPhoto) return;
    photoRequestRef.current += 1;
    setPhotoStatus('error');
    setPhotoProgress(0);
    setPhotoChoice('original');
    setPhotoError('Белый фон пока не готов. Оригинал сохранён — форму можно заполнить и отправить.');
    setDraft((current) => ({ ...current, imageFile: originalPhoto }));
  };

  const processPhotoFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Выберите фотографию товара в формате изображения.');
      setPhotoStatus('error');
      return;
    }

    const requestId = photoRequestRef.current + 1;
    photoRequestRef.current = requestId;
    setError('');
    setOriginalPhoto(file);
    setProcessedPhoto(null);
    setPhotoChoice('original');
    setPhotoStatus('processing');
    setPhotoProgress(1);
    setPhotoError('');
    setPhotoRefinementOpen(false);
    setPhotoRefinementMessage('');
    setDraft((current) => ({ ...current, imageFile: file }));

    let timeout = 0;
    try {
      const processed = await Promise.race([
        photoProcessor(file, (progress) => {
          if (photoRequestRef.current === requestId) setPhotoProgress(progress);
        }),
        new Promise<never>((_, reject) => {
          timeout = window.setTimeout(() => reject(new Error('photo-processing-timeout')), photoProcessingTimeoutMs);
        })
      ]);
      if (photoRequestRef.current !== requestId) return;
      setProcessedPhoto(processed);
      setPhotoChoice('processed');
      setPhotoStatus('ready');
      setPhotoProgress(100);
      setDraft((current) => ({ ...current, imageFile: processed }));
    } catch (processingError) {
      if (photoRequestRef.current !== requestId) return;
      photoRequestRef.current += 1;
      setPhotoStatus('error');
      setPhotoChoice('original');
      setPhotoError(processingError instanceof Error && processingError.message === 'photo-processing-timeout'
        ? 'Обработка белого фона заняла слишком много времени. Оригинал сохранён — можно продолжить без ожидания.'
        : 'Не удалось автоматически убрать фон. Оригинал сохранён — можно продолжить или выбрать другое фото.');
      setDraft((current) => ({ ...current, imageFile: file }));
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const processSelectedPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    await processPhotoFile(event.target.files?.[0] ?? null);
  };

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    setError('');
    try {
      const [nextProducts, nextCategories] = await Promise.all([
        searchSharedProducts({ query, categoryId: categoryFilter === 'all' ? null : categoryFilter }),
        listMasterCategories()
      ]);
      setProducts(nextProducts);
      setCategories(nextCategories);
      setDraft((current) => current.categoryId ? current : { ...current, categoryId: nextCategories[0]?.id ?? '' });
    } catch {
      setError('Не удалось загрузить общую базу. Попробуйте обновить раздел.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, demo, query]);

  useEffect(() => {
    if (demo) return;
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [demo, load]);

  const visibleProducts = useMemo(() => {
    if (!demo) return products;
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    return products.filter((product) => (
      (categoryFilter === 'all' || product.categoryId === categoryFilter)
      && (!normalizedQuery
        || product.title.toLocaleLowerCase('ru').includes(normalizedQuery)
        || product.barcode.includes(normalizedQuery))
    ));
  }, [categoryFilter, demo, products, query]);

  const useDetectedBarcode = (barcode: string) => {
    warmUpPhotoProcessor();
    setScannerOpen(false);
    setQuery(barcode);
    const found = findSharedProductByBarcode(products, barcode);
    if (!found) {
      setDraft((current) => ({ ...current, barcode }));
      setFormOpen(true);
      setMessage('Товар не найден. Заполните новую общую карточку.');
      if (captureWizardActive) setPhotoCameraOpen(true);
    } else {
      setCaptureWizardActive(false);
      setFormOpen(false);
      setMessage(`Найдено: ${found.title}`);
    }
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (name.length < 2) return;
    setSaving(true);
    setError('');
    try {
      const existing = categories.find((category) => category.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'));
      const id = existing?.id ?? (demo
        ? `demo-${crypto.randomUUID()}`
        : await createSharedProductCategory({ catalogId: mode === 'merchant' ? catalogId : null, name }));
      if (!existing) setCategories((current) => [...current, { id, parentId: null, name }]);
      setDraft((current) => ({ ...current, categoryId: id }));
      setNewCategoryName('');
      setNewCategoryOpen(false);
      setMessage(`Общая группа «${name}» доступна всем магазинам.`);
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'Не удалось добавить группу');
    } finally {
      setSaving(false);
    }
  };

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidGlobalBarcode(draft.barcode)) {
      setError('Проверьте штрих‑код: контрольная сумма не совпадает.');
      return;
    }
    if (!draft.title.trim() || !draft.categoryId) {
      setError('Укажите название и общую группу товара.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const existingProduct = findSharedProductByBarcode(products, draft.barcode)
        ?? (demo ? null : await lookupSharedProductByBarcode(draft.barcode));

      if (existingProduct) {
        setCategoryFilter('all');
        setQuery(existingProduct.barcode);
        setFormOpen(false);
        setMessage('');
        setError(`Штрих‑код ${existingProduct.barcode} уже принадлежит товару «${existingProduct.title}». Другой товар с этим кодом создать нельзя.`);
        return;
      }

      let imageUrl: string | null = null;
      if (draft.imageFile && !demo) {
        imageUrl = (await uploadSharedProductImage({
          catalogId: mode === 'merchant' ? catalogId : null,
          file: draft.imageFile
        })).url;
      } else if (draft.imageFile) {
        imageUrl = URL.createObjectURL(draft.imageFile);
      }

      const category = categories.find((item) => item.id === draft.categoryId) ?? null;
      const id = demo ? `demo-${crypto.randomUUID()}` : await submitSharedProduct({
        catalogId: mode === 'merchant' ? catalogId : null,
        barcode: draft.barcode,
        title: draft.title,
        masterCategoryId: draft.categoryId,
        imageUrl,
        product: { description: draft.description }
      });
      const nextProduct: SharedProduct = {
        id,
        title: draft.title.trim(),
        brand: null,
        description: draft.description.trim() || null,
        ingredients: null,
        allergens: [],
        countryOfOrigin: null,
        netContentValue: null,
        netContentUnit: null,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        barcode: draft.barcode.replace(/[\s-]+/g, ''),
        normalizedBarcode: normalizeGlobalBarcode(draft.barcode) ?? '',
        imageUrl,
        version: 1,
        status: mode === 'platform' ? 'verified' : 'pending'
      };
      setProducts((current) => [nextProduct, ...current.filter((product) => product.id !== id)]);
      setDraft(emptyDraft(categories[0]?.id));
      resetPhoto();
      setFormOpen(false);
      setMessage(mode === 'platform' ? 'Товар добавлен в общую базу.' : 'Товар добавлен в общую базу и отправлен на проверку.');
    } catch (productError) {
      setError(productError instanceof Error ? productError.message : 'Не удалось сохранить товар');
    } finally {
      setSaving(false);
    }
  };

  const addToStore = async (product: SharedProduct) => {
    if (mode !== 'merchant' || !catalogId && !demo) return;
    setSaving(true);
    setError('');
    try {
      if (!demo && catalogId) await addSharedProductsToCatalog(catalogId, [product.id]);
      setAddedIds((current) => new Set(current).add(product.id));
      setMessage(`«${product.title}» добавлен в каталог магазина как черновик. Цену и остаток задайте в разделе «Товары».`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Не удалось добавить товар в магазин');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="shared-catalog-page">
      <header className="shared-catalog-head">
        <div>
          <span>{mode === 'platform' ? 'Суперадмин' : 'Кабинет магазина'}</span>
          <h1>Общая база товаров</h1>
          <p>Название, группа, описание, фото и штрих‑код — единые для всех магазинов.</p>
        </div>
        <button type="button" onClick={() => {
          warmUpPhotoProcessor();
          prepareBarcodeScanSound();
          setFormOpen(true);
          setCaptureWizardActive(true);
          setScannerOpen(true);
        }}><Plus />Добавить товар</button>
      </header>

      <section className="shared-catalog-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или штрих‑код" /></label>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Общая группа">
          <option value="all">Все группы</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <button type="button" onClick={() => {
          prepareBarcodeScanSound();
          setCaptureWizardActive(false);
          setScannerOpen(true);
        }}><Camera />Сканировать</button>
      </section>

      {message && <p className="shared-catalog-message"><Check />{message}</p>}
      {error && <p className="shared-catalog-error">{error}</p>}

      {formOpen && (
        <form className="shared-catalog-form" onSubmit={createProduct}>
          <div className="shared-catalog-form__head">
            <div><PackagePlus /><span><strong>Новый товар в общей базе</strong><small>Цена и остаток здесь не указываются</small></span></div>
            <button type="button" onClick={() => setFormOpen(false)}>Закрыть</button>
          </div>
          <div className="shared-catalog-form__grid">
            <label>Штрих‑код<span className="shared-catalog-barcode-field"><Barcode /><input required inputMode="numeric" value={draft.barcode} onChange={(event) => setDraft((current) => ({ ...current, barcode: event.target.value.slice(0, 32) }))} placeholder="4601234567890" /><button type="button" aria-label="Сканировать штрих‑код" onClick={() => {
              prepareBarcodeScanSound();
              setCaptureWizardActive(false);
              setScannerOpen(true);
            }}><Camera />Сканировать</button></span></label>
            <fieldset className="shared-catalog-photo-field"><legend>Фотография</legend><span className="shared-catalog-photo-source"><button type="button" onClick={() => setPhotoCameraOpen(true)}><Camera />Открыть камеру с рамкой</button><button className="shared-catalog-gallery-button" type="button" onClick={chooseAnotherPhoto}><ImagePlus />{originalPhoto?.name ?? 'Выбрать из галереи'}</button><input className="shared-catalog-file-input" ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Сфотографировать или выбрать фото" onChange={(event) => void processSelectedPhoto(event)} /></span></fieldset>
            <label>Название<input required maxLength={120} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Название с упаковки" /></label>
            <label>Общая группа<span className="shared-catalog-category-row"><select required value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Выберите группу</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" onClick={() => setNewCategoryOpen(true)}><Plus />Новая</button></span></label>
          </div>
          {originalPhoto && (
            <section className="shared-catalog-photo-review" aria-label="Проверка фотографии товара">
              {photoStatus === 'processing' && (
                <div className="shared-catalog-photo-progress" aria-live="polite">
                  <LoaderCircle className="is-spinning" />
                  <span><strong>Убираем фон и готовим белый вариант…</strong><small>Оригинал уже выбран — товар можно сохранить сразу.</small></span>
                  <progress max="100" value={photoProgress}>{photoProgress}%</progress>
                  <button type="button" onClick={continueWithOriginalPhoto}>Продолжить с оригиналом</button>
                </div>
              )}
              {photoStatus !== 'processing' && (
                <>
                  <div className="shared-catalog-photo-options">
                    {originalPhotoUrl && (
                      <button className={photoChoice === 'original' ? 'is-selected' : ''} type="button" aria-pressed={photoChoice === 'original'} onClick={selectOriginalPhoto}>
                        <img src={originalPhotoUrl} alt="Оригинальная фотография товара" />
                        <span><strong>Оригинал</strong><small>Без обработки</small></span>
                      </button>
                    )}
                    {processedPhotoUrl && (
                      <button className={photoChoice === 'processed' ? 'is-selected' : ''} type="button" aria-pressed={photoChoice === 'processed'} onClick={selectProcessedPhoto}>
                        <img src={processedPhotoUrl} alt="Товар на белом фоне" />
                        <span><strong>Белый фон</strong><small>Фон удалён автоматически</small></span>
                      </button>
                    )}
                  </div>
                  {photoError && <p className="shared-catalog-photo-error" role="alert">{photoError}</p>}
                  <div className="shared-catalog-photo-actions">
                    {processedPhoto && <button type="button" onClick={selectProcessedPhoto}><Check />Использовать белый фон</button>}
                    {processedPhoto && originalPhoto && <button type="button" onClick={() => setPhotoRefinementOpen(true)}><Paintbrush />Подправить кистью</button>}
                    <button type="button" onClick={selectOriginalPhoto}>Оставить оригинал</button>
                    <button type="button" onClick={chooseAnotherPhoto}><ImagePlus />Выбрать другое фото</button>
                  </div>
                  <p className="shared-catalog-photo-choice">
                    <Check />{photoChoice === 'processed'
                      ? 'Будет сохранено фото на белом фоне'
                      : 'Будет сохранена оригинальная фотография'}
                  </p>
                  {photoRefinementMessage && <p className="shared-catalog-photo-refinement-message"><Check />{photoRefinementMessage}</p>}
                </>
              )}
            </section>
          )}
          {photoRefinementOpen && originalPhoto && processedPhoto && (
            <ProductPhotoRefinementEditor
              original={originalPhoto}
              automatic={processedPhoto}
              refine={photoRefiner}
              onCancel={() => setPhotoRefinementOpen(false)}
              onApply={(refinedPhoto) => {
                setProcessedPhoto(refinedPhoto);
                setPhotoChoice('processed');
                setDraft((current) => ({ ...current, imageFile: refinedPhoto }));
                setPhotoRefinementMessage('Граница уточнена — сохранится исправленный белый фон.');
                setPhotoRefinementOpen(false);
              }}
            />
          )}
          {photoCameraOpen && (
            <ProductPhotoCamera
              wizard={captureWizardActive}
              onClose={() => {
                setPhotoCameraOpen(false);
                setCaptureWizardActive(false);
              }}
              onChooseFile={() => {
                setPhotoCameraOpen(false);
                setCaptureWizardActive(false);
                chooseAnotherPhoto();
              }}
              onCapture={(file) => {
                setPhotoCameraOpen(false);
                setCaptureWizardActive(false);
                void processPhotoFile(file);
              }}
            />
          )}
          {newCategoryOpen && <div className="shared-catalog-new-category"><Tags /><input autoFocus maxLength={80} value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Название новой общей группы" /><button disabled={saving || newCategoryName.trim().length < 2} type="button" onClick={() => void addCategory()}>Добавить для всех</button></div>}
          <label className="shared-catalog-description">Описание<textarea maxLength={1000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Необязательно" /></label>
          <button className="shared-catalog-save" disabled={saving} type="submit">{saving ? <LoaderCircle className="is-spinning" /> : <Plus />}{mode === 'platform' ? 'Добавить в общую базу' : 'Отправить в общую базу'}</button>
        </form>
      )}

      <section className="shared-catalog-list" aria-busy={loading}>
        <div className="shared-catalog-list__head"><h2>Все товары</h2><span>{visibleProducts.length}</span></div>
        {loading && <p className="shared-catalog-empty"><LoaderCircle className="is-spinning" />Загружаем товары…</p>}
        {!loading && visibleProducts.length === 0 && <p className="shared-catalog-empty">Ничего не найдено. Отсканируйте штрих‑код или добавьте новый товар.</p>}
        {!loading && visibleProducts.map((product) => (
          <article className="shared-catalog-product" key={product.id}>
            <div className="shared-catalog-product__image">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Barcode />}</div>
            <div className="shared-catalog-product__copy">
              <span>{product.categoryName ?? 'Без группы'} · {product.status === 'verified' ? 'Проверено' : 'На проверке'}</span>
              <h3>{product.title}</h3>
              <p>{product.description || 'Описание пока не добавлено'}</p>
              <code>{product.barcode}</code>
            </div>
            {mode === 'merchant' ? (
              <button type="button" disabled={saving || addedIds.has(product.id)} onClick={() => void addToStore(product)}>
                {addedIds.has(product.id) ? <><Check />Добавлен</> : <><Store />Добавить в магазин</>}
              </button>
            ) : (
              <button type="button" onClick={() => setMessage(`Открыта карточка «${product.title}» для проверки.`)}>Проверить</button>
            )}
          </article>
        ))}
      </section>

      {scannerOpen && <SharedBarcodeScanner
        onDetected={useDetectedBarcode}
        onClose={() => {
          setScannerOpen(false);
          setCaptureWizardActive(false);
        }}
        onNext={captureWizardActive ? () => {
          setScannerOpen(false);
          setPhotoCameraOpen(true);
        } : undefined}
      />}
    </main>
  );
}
