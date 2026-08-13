const BACKGROUND_MODEL = 'Ko033/isnet-general-use-onnx';
const MAX_PROCESSED_SIDE = 1600;

export type ProductPhotoProgress = (percent: number) => void;
export type ProductPhotoProcessor = (
  file: File,
  onProgress: ProductPhotoProgress
) => Promise<File>;

type CutoutImage = {
  toBlob: (type?: string, quality?: number) => Promise<Blob>;
};

type BackgroundSegmenter = (image: Blob) => Promise<CutoutImage[]>;

let segmenterPromise: Promise<BackgroundSegmenter> | null = null;

const createProgressReporter = (onProgress: ProductPhotoProgress) => {
  let lastProgress = 0;
  return (nextProgress: number) => {
    lastProgress = Math.max(lastProgress, Math.min(100, Math.round(nextProgress)));
    onProgress(lastProgress);
  };
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => (
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось подготовить изображение'));
    }, type, quality);
  })
);

const decodeImage = async (blob: Blob) => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close()
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      element.src = objectUrl;
    });
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => undefined
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const scaledSize = (width: number, height: number, maxSide: number) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
};

const resizeForSegmentation = async (file: File) => {
  const decoded = await decodeImage(file);
  try {
    const size = scaledSize(decoded.width, decoded.height, MAX_PROCESSED_SIDE);
    if (size.width === decoded.width && size.height === decoded.height) return file;

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить фотографию');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(decoded.source, 0, 0, size.width, size.height);
    return await canvasToBlob(canvas, 'image/jpeg', 0.94);
  } finally {
    decoded.close();
  }
};

const loadSegmenter = async (report: (percent: number) => void) => {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      report(4);
      const { pipeline } = await import('@huggingface/transformers');
      report(8);
      const loaded = await pipeline('background-removal', BACKGROUND_MODEL, {
        device: 'wasm',
        dtype: 'q8',
        // v3 supports ISNet, while this model intentionally publishes a generic config.
        config: { model_type: 'isnet', is_encoder_decoder: false } as never,
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.file.includes('model_quantized')) {
            report(10 + progress.progress * 0.58);
          }
        }
      });
      return loaded as unknown as BackgroundSegmenter;
    })().catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }

  const segmenter = await segmenterPromise;
  report(70);
  return segmenter;
};

export const whiteBackgroundFileName = (originalName: string) => {
  const baseName = originalName.replace(/\.[^.]+$/, '').trim() || 'product';
  return `${baseName}-white-background.jpg`;
};

export async function placeCutoutOnWhite(
  cutout: Blob,
  originalName: string,
  maxSide = MAX_PROCESSED_SIDE
) {
  const decoded = await decodeImage(cutout);
  try {
    const size = scaledSize(decoded.width, decoded.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить белый фон');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(decoded.source, 0, 0, size.width, size.height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.94);
    return new File([blob], whiteBackgroundFileName(originalName), {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } finally {
    decoded.close();
  }
}

export const removeProductPhotoBackground: ProductPhotoProcessor = async (file, onProgress) => {
  if (!file.type.startsWith('image/')) throw new Error('Выберите изображение товара');

  const report = createProgressReporter(onProgress);
  report(1);
  const preparedImage = await resizeForSegmentation(file);
  report(3);
  const segmenter = await loadSegmenter(report);
  const result = await segmenter(preparedImage);
  report(90);
  const cutout = result[0];
  if (!cutout) throw new Error('Модель не смогла выделить товар');
  const transparentImage = await cutout.toBlob('image/png');
  const whiteImage = await placeCutoutOnWhite(transparentImage, file.name);
  report(100);
  return whiteImage;
};
