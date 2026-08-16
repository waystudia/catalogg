import { Check, ImagePlus, LoaderCircle, Paintbrush, Plus, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { imageFileToDataUrl } from '../../shared/images';
import {
  removeProductPhotoBackground,
  refineProductPhotoBackground,
  type ProductPhotoProcessor,
  type ProductPhotoRefiner
} from '../shared-product-catalog/productPhotoBackground';
import { ProductPhotoRefinementEditor } from '../shared-product-catalog/ProductPhotoRefinementEditor';

type PhotoVersion = {
  index: number;
  original: string;
  processed: string;
  originalFile: File;
  processedFile: File;
};

export function GroceryProductPhotoEditor({
  images,
  onChange,
  photoProcessor = removeProductPhotoBackground,
  photoRefiner = refineProductPhotoBackground
}: {
  images: string[];
  onChange: (images: string[]) => void;
  photoProcessor?: ProductPhotoProcessor;
  photoRefiner?: ProductPhotoRefiner;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState<PhotoVersion | null>(null);
  const [choice, setChoice] = useState<'original' | 'processed'>('original');
  const [error, setError] = useState('');
  const [refinementOpen, setRefinementOpen] = useState(false);

  const replacePhoto = (index: number, value: string) => {
    onChange(images.map((image, imageIndex) => imageIndex === index ? value : image));
  };

  const addPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Выберите фотографию товара.');
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const index = Math.min(images.length, 2);
    setProcessing(true);
    setProgress(1);
    setChoice('original');
    setVersion(null);
    setError('');

    const original = await imageFileToDataUrl(file);
    if (requestRef.current !== requestId) return;
    const nextImages = images.length < 3
      ? [...images, original]
      : images.map((image, imageIndex) => imageIndex === index ? original : image);
    onChange(nextImages.slice(0, 3));

    try {
      const processedFile = await photoProcessor(file, (nextProgress) => {
        if (requestRef.current === requestId) setProgress(nextProgress);
      });
      const processed = await imageFileToDataUrl(processedFile);
      if (requestRef.current !== requestId) return;
      setVersion({ index, original, processed, originalFile: file, processedFile });
      setChoice('processed');
      setProgress(100);
      setProcessing(false);
      onChange(nextImages.map((image, imageIndex) => imageIndex === index ? processed : image).slice(0, 3));
    } catch {
      if (requestRef.current !== requestId) return;
      setProcessing(false);
      setChoice('original');
      setError('Не удалось убрать фон. Оригинал сохранён — товар можно продолжить заполнять.');
    }
  };

  return (
    <section className="dish-section grocery-product-photo-editor">
      <div className="dish-section__head">
        <h3>Сначала фотография товара</h3>
        <span>{images.length}/3</span>
      </div>
      <small>После снимка автоматически подготовим быстрый вариант на белом фоне.</small>
      <div className="dish-photos">
        {images.map((image, index) => (
          <article className="dish-photo" key={`${image}-${index}`}>
            <img src={image} alt={`Фото товара ${index + 1}`} />
            <button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => {
              requestRef.current += 1;
              setVersion(null);
              setRefinementOpen(false);
              setProcessing(false);
              onChange(images.filter((_, imageIndex) => imageIndex !== index));
            }}><X /></button>
          </article>
        ))}
        {images.length < 3 && (
          <label className="dish-photo dish-photo--add">
            <Plus />
            <span>Сфотографировать</span>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" aria-label="Сфотографировать товар" onChange={(event) => void addPhoto(event)} />
          </label>
        )}
      </div>

      {processing && (
        <div className="grocery-photo-processing" aria-live="polite">
          <LoaderCircle className="is-spinning" />
          <span><strong>Убираем фон…</strong><small>{progress}% · оригинал уже доступен</small></span>
          <progress max="100" value={progress}>{progress}%</progress>
        </div>
      )}

      {version && !processing && (
        <div className="grocery-photo-choices" aria-label="Выбор фона фотографии">
          <button type="button" className={choice === 'original' ? 'is-selected' : ''} aria-pressed={choice === 'original'} onClick={() => {
            setChoice('original');
            replacePhoto(version.index, version.original);
          }}><img src={version.original} alt="Оригинальная фотография товара" /><span>Оригинал</span></button>
          <button type="button" className={choice === 'processed' ? 'is-selected' : ''} aria-pressed={choice === 'processed'} onClick={() => {
            setChoice('processed');
            replacePhoto(version.index, version.processed);
          }}><img src={version.processed} alt="Товар на белом фоне" /><span><Check />Белый фон</span></button>
          <button type="button" onClick={() => setRefinementOpen(true)}><Paintbrush />Подправить кистью</button>
          <button type="button" onClick={() => inputRef.current?.click()}><ImagePlus />Другое фото</button>
        </div>
      )}
      {refinementOpen && version && (
        <ProductPhotoRefinementEditor
          original={version.originalFile}
          automatic={version.processedFile}
          refine={photoRefiner}
          onCancel={() => setRefinementOpen(false)}
          onApply={async (refinedFile) => {
            const refined = await imageFileToDataUrl(refinedFile);
            setVersion((current) => current ? {
              ...current,
              processed: refined,
              processedFile: refinedFile
            } : current);
            setChoice('processed');
            replacePhoto(version.index, refined);
            setRefinementOpen(false);
          }}
        />
      )}
      {error && <p className="grocery-form-error" role="alert">{error}</p>}
    </section>
  );
}
