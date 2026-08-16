import { Check, LoaderCircle, Paintbrush, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import {
  refineProductPhotoBackground,
  type ProductPhotoRefiner,
  type ProductPhotoStroke
} from './productPhotoBackground';
import './product-photo-refinement.css';

const useFileUrl = (file: File) => {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
};

const pointFromPointer = (
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>
) => {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
  };
};

export function ProductPhotoRefinementEditor({
  original,
  automatic,
  refine = refineProductPhotoBackground,
  onApply,
  onCancel
}: {
  original: File;
  automatic: File;
  refine?: ProductPhotoRefiner;
  onApply: (file: File) => void | Promise<void>;
  onCancel: () => void;
}) {
  const originalUrl = useFileUrl(original);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<ProductPhotoStroke['kind']>('foreground');
  const [strokes, setStrokes] = useState<ProductPhotoStroke[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = Math.max(12, Math.min(canvas.width, canvas.height) * 0.045);
      strokes.forEach((stroke) => {
        if (stroke.points.length === 0) return;
        context.beginPath();
        context.strokeStyle = stroke.kind === 'foreground'
          ? 'rgba(21, 190, 110, .86)'
          : 'rgba(232, 70, 70, .86)';
        stroke.points.forEach((point, index) => {
          const x = point.x * canvas.width;
          const y = point.y * canvas.height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        if (stroke.points.length === 1) {
          const point = stroke.points[0];
          context.lineTo(point.x * canvas.width + 0.01, point.y * canvas.height + 0.01);
        }
        context.stroke();
      });
    };
    image.src = originalUrl;
  }, [originalUrl, strokes]);

  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (processing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    activePointerRef.current = event.pointerId;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older Safari versions may not expose an active capture.
    }
    const point = pointFromPointer(canvas, event);
    setStrokes((current) => [...current, { kind: mode, points: [point] }]);
  };

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = pointFromPointer(canvas, event);
    setStrokes((current) => current.map((stroke, index) => (
      index === current.length - 1
        ? { ...stroke, points: [...stroke.points, point] }
        : stroke
    )));
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    continueStroke(event);
    activePointerRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Releasing an already-ended pointer is harmless; the stroke is already recorded.
    }
  };

  const apply = async () => {
    if (strokes.length === 0 || processing) return;
    setProcessing(true);
    setError('');
    try {
      const result = await refine(original, automatic, strokes);
      await onApply(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось уточнить границу');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="product-photo-refinement" role="presentation">
      <section
        className="product-photo-refinement__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-photo-refinement-title"
      >
        <header>
          <div>
            <Paintbrush />
            <span>
              <strong id="product-photo-refinement-title">Уточнение границы товара</strong>
              <small>Проведите примерно внутри товара — система сама найдёт ближайшую границу.</small>
            </span>
          </div>
          <button type="button" aria-label="Закрыть кисть" onClick={onCancel}><X /></button>
        </header>

        <div className="product-photo-refinement__tools" aria-label="Режим кисти">
          <button
            className={mode === 'foreground' ? 'is-active is-foreground' : ''}
            type="button"
            aria-pressed={mode === 'foreground'}
            onClick={() => setMode('foreground')}
          ><span />Товар</button>
          <button
            className={mode === 'background' ? 'is-active is-background' : ''}
            type="button"
            aria-pressed={mode === 'background'}
            onClick={() => setMode('background')}
          ><span />Фон</button>
          <button type="button" disabled={strokes.length === 0} onClick={() => setStrokes((current) => current.slice(0, -1))}>
            <RotateCcw />Отменить штрих
          </button>
        </div>

        <div className="product-photo-refinement__canvas-wrap">
          <canvas
            ref={canvasRef}
            aria-label="Кисть уточнения фотографии"
            onPointerDown={startStroke}
            onPointerMove={continueStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
          />
        </div>

        <p className="product-photo-refinement__hint">
          <Check />Не обводите идеально: зелёным отметьте товар, красным — лишний фон.
        </p>
        {error && <p className="product-photo-refinement__error" role="alert">{error}</p>}

        <footer>
          <button type="button" onClick={onCancel}>Отмена</button>
          <button type="button" disabled={strokes.length === 0 || processing} onClick={() => void apply()}>
            {processing ? <LoaderCircle className="is-spinning" /> : <Sparkles />}
            {processing ? 'Уточняем…' : 'Уточнить автоматически'}
          </button>
        </footer>
      </section>
    </div>
  );
}
