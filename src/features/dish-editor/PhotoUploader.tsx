import { Plus, X } from 'lucide-react';
import { imageFileToDataUrl } from '../../shared/images';

function moveItem(items: string[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PhotoUploader({
  images,
  onChange
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const addFiles = async (files: FileList | null) => {
    if (!files) {
      return;
    }

    const remaining = Math.max(0, 3 - images.length);
    const selected = Array.from(files).slice(0, remaining);
    const urls = await Promise.all(selected.map((file) => imageFileToDataUrl(file)));
    onChange([...images, ...urls].slice(0, 3));
  };

  return (
    <section className="dish-section">
      <div className="dish-section__head">
        <h3>Фотографии блюда</h3>
        <span>{images.length}/3</span>
      </div>
      <small>До 3 фото · формат 4:3 · важное по центру.</small>
      <div className="dish-photos">
        {images.map((image, index) => (
          <article
            className="dish-photo"
            key={`${image}-${index}`}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData('text/plain'));
              if (Number.isInteger(from) && from !== index) {
                onChange(moveItem(images, from, index));
              }
            }}
          >
            <img src={image} alt={`Фото блюда ${index + 1}`} />
            <button
              type="button"
              aria-label="Удалить фото"
              onClick={() => onChange(images.filter((_, itemIndex) => itemIndex !== index))}
            >
              <X />
            </button>
          </article>
        ))}
        {images.length < 3 && (
          <label className="dish-photo dish-photo--add">
            <Plus />
            <span>Добавить фото</span>
            <input type="file" accept="image/*" multiple onChange={(event) => void addFiles(event.target.files)} />
          </label>
        )}
      </div>
    </section>
  );
}
