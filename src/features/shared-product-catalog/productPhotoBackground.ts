const BACKGROUND_MODEL = 'isnet-general-use-onnx-5349b617';
const MAX_PROCESSED_SIDE = 1024;
const ortWasmModuleUrl = new URL(
  '../../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs',
  import.meta.url
).href;
const ortWasmBinaryUrl = new URL(
  '../../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm',
  import.meta.url
).href;

export type ProductPhotoProgress = (percent: number) => void;
export type ProductPhotoProcessor = (
  file: File,
  onProgress: ProductPhotoProgress
) => Promise<File>;

export type ProductPhotoStroke = {
  kind: 'foreground' | 'background';
  points: Array<{ x: number; y: number }>;
};

export type ProductPhotoRefiner = (
  original: File,
  automatic: File,
  strokes: ProductPhotoStroke[]
) => Promise<File>;

type CutoutImage = {
  toBlob: (type?: string, quality?: number) => Promise<Blob>;
};

type BackgroundSegmenter = (image: Blob) => Promise<CutoutImage[]>;
type ModelDownloadProgress = {
  status: string;
  file?: string;
  progress?: number;
};

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
      const {
        AutoImageProcessor,
        AutoModelForImageSegmentation,
        BackgroundRemovalPipeline,
        env
      } = await import('@huggingface/transformers');
      report(8);
      const localModelPath = new URL(
        `${import.meta.env.BASE_URL}assets/models/`,
        window.location.origin
      ).href;
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = localModelPath;
      env.backends.onnx.logLevel = 'error';
      if (!env.backends.onnx.wasm) throw new Error('Локальный модуль обработки недоступен');
      env.backends.onnx.wasm.wasmPaths = {
        mjs: new URL(ortWasmModuleUrl, window.location.origin).href,
        wasm: new URL(ortWasmBinaryUrl, window.location.origin).href
      };
      const modelOptions = {
        device: 'wasm',
        dtype: 'q8',
        local_files_only: true,
        session_options: { logSeverityLevel: 3 },
        // Transformers.js uses the same generic segmentation wrapper for U²-Net and ISNet.
        config: { model_type: 'isnet', architectures: ['PreTrainedModel'] } as never,
        progress_callback: (progress: ModelDownloadProgress) => {
          if (
            progress.status === 'progress'
            && progress.file?.endsWith('.onnx')
            && typeof progress.progress === 'number'
          ) {
            report(10 + progress.progress * 0.58);
          }
        }
      } as const;
      const [model, processor] = await Promise.all([
        AutoModelForImageSegmentation.from_pretrained(BACKGROUND_MODEL, modelOptions),
        AutoImageProcessor.from_pretrained(BACKGROUND_MODEL, modelOptions)
      ]);
      const loaded = new BackgroundRemovalPipeline({
        task: 'background-removal',
        model,
        processor
      } as never);
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

export const preloadProductPhotoBackgroundRemoval = () => loadSegmenter(() => undefined).then(() => undefined);

export const whiteBackgroundFileName = (originalName: string) => {
  const baseName = originalName.replace(/\.[^.]+$/, '').trim() || 'product';
  return `${baseName}-white-background.jpg`;
};

export const refinedWhiteBackgroundFileName = (originalName: string) => {
  const baseName = originalName.replace(/\.[^.]+$/, '').trim() || 'product';
  return `${baseName}-refined-white-background.jpg`;
};

type PixelSample = {
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
};

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

const sampleStrokePixels = (
  strokes: ProductPhotoStroke[],
  kind: ProductPhotoStroke['kind'],
  pixels: Uint8ClampedArray,
  width: number,
  height: number
) => strokes
  .filter((stroke) => stroke.kind === kind)
  .flatMap((stroke) => stroke.points)
  .map((point): PixelSample => {
    const x = Math.round(clampUnit(point.x) * (width - 1));
    const y = Math.round(clampUnit(point.y) * (height - 1));
    const offset = (y * width + x) * 4;
    return {
      x: width > 1 ? x / (width - 1) : 0,
      y: height > 1 ? y / (height - 1) : 0,
      red: pixels[offset],
      green: pixels[offset + 1],
      blue: pixels[offset + 2]
    };
  });

const guidedDistance = (
  red: number,
  green: number,
  blue: number,
  x: number,
  y: number,
  samples: PixelSample[]
) => samples.reduce((nearest, sample) => {
  const redDistance = red - sample.red;
  const greenDistance = green - sample.green;
  const blueDistance = blue - sample.blue;
  const colorDistance = (
    redDistance * redDistance
    + greenDistance * greenDistance
    + blueDistance * blueDistance
  ) / (255 * 255 * 3);
  const xDistance = x - sample.x;
  const yDistance = y - sample.y;
  const spatialDistance = xDistance * xDistance + yDistance * yDistance;
  return Math.min(nearest, colorDistance * 0.86 + spatialDistance * 0.14);
}, Number.POSITIVE_INFINITY);

const estimateAutomaticAlpha = (
  original: Uint8ClampedArray,
  automatic: Uint8ClampedArray,
  offset: number
) => {
  let weightedAlpha = 0;
  let weight = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const denominator = 255 - original[offset + channel];
    if (denominator <= 8) continue;
    weightedAlpha += clampUnit((255 - automatic[offset + channel]) / denominator) * denominator;
    weight += denominator;
  }
  if (weight > 0) return weightedAlpha / weight;
  const difference = Math.max(
    Math.abs(original[offset] - automatic[offset]),
    Math.abs(original[offset + 1] - automatic[offset + 1]),
    Math.abs(original[offset + 2] - automatic[offset + 2])
  );
  return difference < 12 ? 1 : 0;
};

const fallbackSamples = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: Array<{ x: number; y: number }>
) => points.map(({ x, y }): PixelSample => {
  const pixelX = Math.round(x * (width - 1));
  const pixelY = Math.round(y * (height - 1));
  const offset = (pixelY * width + pixelX) * 4;
  return {
    x,
    y,
    red: pixels[offset],
    green: pixels[offset + 1],
    blue: pixels[offset + 2]
  };
});

export const refineProductPhotoBackground: ProductPhotoRefiner = async (
  original,
  automatic,
  strokes
) => {
  const usableStrokes = strokes.filter((stroke) => stroke.points.length > 0);
  if (usableStrokes.length === 0) throw new Error('Добавьте хотя бы один штрих кистью');

  const [decodedOriginal, decodedAutomatic] = await Promise.all([
    decodeImage(original),
    decodeImage(automatic)
  ]);
  try {
    const width = decodedAutomatic.width;
    const height = decodedAutomatic.height;
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width;
    originalCanvas.height = height;
    const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true });
    if (!originalContext) throw new Error('Не удалось открыть исходную фотографию');
    originalContext.drawImage(decodedOriginal.source, 0, 0, width, height);
    const originalPixels = originalContext.getImageData(0, 0, width, height).data;

    const automaticCanvas = document.createElement('canvas');
    automaticCanvas.width = width;
    automaticCanvas.height = height;
    const automaticContext = automaticCanvas.getContext('2d', { willReadFrequently: true });
    if (!automaticContext) throw new Error('Не удалось открыть автоматическую обработку');
    automaticContext.drawImage(decodedAutomatic.source, 0, 0, width, height);
    const automaticPixels = automaticContext.getImageData(0, 0, width, height).data;

    const foregroundSamples = sampleStrokePixels(usableStrokes, 'foreground', originalPixels, width, height);
    const backgroundSamples = sampleStrokePixels(usableStrokes, 'background', originalPixels, width, height);
    const effectiveForeground = foregroundSamples.length > 0
      ? foregroundSamples
      : fallbackSamples(originalPixels, width, height, [{ x: 0.5, y: 0.5 }]);
    const effectiveBackground = backgroundSamples.length > 0
      ? backgroundSamples
      : fallbackSamples(originalPixels, width, height, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 }
      ]);

    const output = originalContext.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const normalizedX = width > 1 ? x / (width - 1) : 0;
        const normalizedY = height > 1 ? y / (height - 1) : 0;
        const foregroundDistance = guidedDistance(
          originalPixels[offset],
          originalPixels[offset + 1],
          originalPixels[offset + 2],
          normalizedX,
          normalizedY,
          effectiveForeground
        );
        const backgroundDistance = guidedDistance(
          originalPixels[offset],
          originalPixels[offset + 1],
          originalPixels[offset + 2],
          normalizedX,
          normalizedY,
          effectiveBackground
        );
        const guidedProbability = backgroundDistance / Math.max(
          0.000001,
          foregroundDistance + backgroundDistance
        );
        const automaticAlpha = estimateAutomaticAlpha(originalPixels, automaticPixels, offset);
        const combinedProbability = automaticAlpha * 0.3 + guidedProbability * 0.7;
        const alpha = clampUnit((combinedProbability - 0.44) / 0.12);
        output.data[offset] = Math.round(originalPixels[offset] * alpha + 255 * (1 - alpha));
        output.data[offset + 1] = Math.round(originalPixels[offset + 1] * alpha + 255 * (1 - alpha));
        output.data[offset + 2] = Math.round(originalPixels[offset + 2] * alpha + 255 * (1 - alpha));
        output.data[offset + 3] = 255;
      }
    }

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultContext = resultCanvas.getContext('2d');
    if (!resultContext) throw new Error('Не удалось подготовить уточнённое фото');
    resultContext.putImageData(output, 0, 0);
    const blob = await canvasToBlob(resultCanvas, 'image/jpeg', 0.94);
    return new File([blob], refinedWhiteBackgroundFileName(original.name), {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } finally {
    decodedOriginal.close();
    decodedAutomatic.close();
  }
};

export async function placeCutoutOnWhite(
  cutout: Blob,
  originalName: string,
  maxSide = MAX_PROCESSED_SIDE,
  originalSource?: Blob
) {
  const decoded = await decodeImage(cutout);
  const decodedOriginal = originalSource ? await decodeImage(originalSource) : null;
  try {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = decoded.width;
    sourceCanvas.height = decoded.height;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) throw new Error('Не удалось подготовить маску товара');
    sourceContext.clearRect(0, 0, decoded.width, decoded.height);
    sourceContext.drawImage(decoded.source, 0, 0);
    const sourcePixels = sourceContext.getImageData(0, 0, decoded.width, decoded.height);
    const pixelCount = decoded.width * decoded.height;
    const thresholded = new Uint8Array(pixelCount);
    const alphaThreshold = 150;
    for (let index = 0; index < pixelCount; index += 1) {
      thresholded[index] = sourcePixels.data[index * 4 + 3] >= alphaThreshold ? 1 : 0;
    }
    if (decodedOriginal) {
      const originalCanvas = document.createElement('canvas');
      originalCanvas.width = decoded.width;
      originalCanvas.height = decoded.height;
      const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true });
      if (!originalContext) throw new Error('Не удалось проверить край товара');
      originalContext.drawImage(decodedOriginal.source, 0, 0, decoded.width, decoded.height);
      const originalPixels = originalContext.getImageData(0, 0, decoded.width, decoded.height).data;
      const borderSamples: Array<[number, number, number]> = [];
      const sampleStep = Math.max(1, Math.floor(Math.min(decoded.width, decoded.height) / 18));
      for (let x = 0; x < decoded.width; x += sampleStep) {
        for (const y of [0, decoded.height - 1]) {
          const offset = (y * decoded.width + x) * 4;
          borderSamples.push([originalPixels[offset], originalPixels[offset + 1], originalPixels[offset + 2]]);
        }
      }
      for (let y = 0; y < decoded.height; y += sampleStep) {
        for (const x of [0, decoded.width - 1]) {
          const offset = (y * decoded.width + x) * 4;
          borderSamples.push([originalPixels[offset], originalPixels[offset + 1], originalPixels[offset + 2]]);
        }
      }
      const backgroundLike = new Uint8Array(pixelCount);
      const maximumBackgroundDistance = 52 * 52 * 3;
      for (let index = 0; index < pixelCount; index += 1) {
        if (!thresholded[index]) continue;
        const offset = index * 4;
        const similarToBorder = borderSamples.some(([red, green, blue]) => {
          const redDistance = originalPixels[offset] - red;
          const greenDistance = originalPixels[offset + 1] - green;
          const blueDistance = originalPixels[offset + 2] - blue;
          return redDistance * redDistance + greenDistance * greenDistance + blueDistance * blueDistance
            <= maximumBackgroundDistance;
        });
        if (similarToBorder) backgroundLike[index] = 1;
      }
      const removable = new Uint8Array(pixelCount);
      const backgroundQueue = new Int32Array(pixelCount);
      let backgroundRead = 0;
      let backgroundWrite = 0;
      for (let y = 0; y < decoded.height; y += 1) {
        for (let x = 0; x < decoded.width; x += 1) {
          const index = y * decoded.width + x;
          if (!backgroundLike[index]) continue;
          const touchesImageEdge = x === 0 || y === 0 || x === decoded.width - 1 || y === decoded.height - 1;
          const touchesTransparent = !touchesImageEdge && (
            !thresholded[index - 1]
            || !thresholded[index + 1]
            || !thresholded[index - decoded.width]
            || !thresholded[index + decoded.width]
          );
          if (!touchesImageEdge && !touchesTransparent) continue;
          removable[index] = 1;
          backgroundQueue[backgroundWrite++] = index;
        }
      }
      while (backgroundRead < backgroundWrite) {
        const current = backgroundQueue[backgroundRead++];
        const x = current % decoded.width;
        const y = Math.floor(current / decoded.width);
        const neighbors = [
          x > 0 ? current - 1 : -1,
          x + 1 < decoded.width ? current + 1 : -1,
          y > 0 ? current - decoded.width : -1,
          y + 1 < decoded.height ? current + decoded.width : -1
        ];
        for (const next of neighbors) {
          if (next < 0 || removable[next] || !backgroundLike[next]) continue;
          removable[next] = 1;
          backgroundQueue[backgroundWrite++] = next;
        }
      }
      for (let index = 0; index < pixelCount; index += 1) {
        if (removable[index]) thresholded[index] = 0;
      }
    }
    const eroded = new Uint8Array(pixelCount);
    for (let y = 0; y < decoded.height; y += 1) {
      for (let x = 0; x < decoded.width; x += 1) {
        const index = y * decoded.width + x;
        if (!thresholded[index]) continue;
        let nearbyForeground = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (
              nextX >= 0 && nextX < decoded.width
              && nextY >= 0 && nextY < decoded.height
              && thresholded[nextY * decoded.width + nextX]
            ) nearbyForeground += 1;
          }
        }
        if (nearbyForeground >= 6) eroded[index] = 1;
      }
    }
    const foreground = new Uint8Array(pixelCount);
    for (let y = 0; y < decoded.height; y += 1) {
      for (let x = 0; x < decoded.width; x += 1) {
        const index = y * decoded.width + x;
        for (let offsetY = -1; offsetY <= 1 && !foreground[index]; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (
              nextX >= 0 && nextX < decoded.width
              && nextY >= 0 && nextY < decoded.height
              && eroded[nextY * decoded.width + nextX]
            ) {
              foreground[index] = 1;
              break;
            }
          }
        }
      }
    }

    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let selected: number[] = [];
    let selectedScore = -1;
    const centerX = (decoded.width - 1) / 2;
    const centerY = (decoded.height - 1) / 2;
    const maxCenterDistance = Math.max(1, Math.hypot(centerX, centerY));

    for (let start = 0; start < pixelCount; start += 1) {
      if (!foreground[start] || visited[start]) continue;
      let read = 0;
      let write = 0;
      let xTotal = 0;
      let yTotal = 0;
      const component: number[] = [];
      queue[write++] = start;
      visited[start] = 1;
      while (read < write) {
        const current = queue[read++];
        component.push(current);
        const x = current % decoded.width;
        const y = Math.floor(current / decoded.width);
        xTotal += x;
        yTotal += y;
        const neighbors = [
          x > 0 ? current - 1 : -1,
          x + 1 < decoded.width ? current + 1 : -1,
          y > 0 ? current - decoded.width : -1,
          y + 1 < decoded.height ? current + decoded.width : -1
        ];
        for (const next of neighbors) {
          if (next < 0 || visited[next] || !foreground[next]) continue;
          visited[next] = 1;
          queue[write++] = next;
        }
      }
      const componentX = xTotal / component.length;
      const componentY = yTotal / component.length;
      const centerWeight = 1.35 - 0.35 * Math.min(
        1,
        Math.hypot(componentX - centerX, componentY - centerY) / maxCenterDistance
      );
      const score = component.length * centerWeight;
      if (score > selectedScore) {
        selectedScore = score;
        selected = component;
      }
    }

    if (selected.length === 0) throw new Error('Модель не смогла отделить товар от фона');
    const selectedMask = new Uint8Array(pixelCount);
    let minX = decoded.width;
    let minY = decoded.height;
    let maxX = 0;
    let maxY = 0;
    for (const index of selected) {
      selectedMask[index] = 1;
      const x = index % decoded.width;
      const y = Math.floor(index / decoded.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    for (let index = 0; index < pixelCount; index += 1) {
      const alphaOffset = index * 4 + 3;
      if (!selectedMask[index]) {
        sourcePixels.data[alphaOffset] = 0;
        continue;
      }
      const originalAlpha = sourcePixels.data[alphaOffset];
      sourcePixels.data[alphaOffset] = Math.round(
        clampUnit((originalAlpha - alphaThreshold) / (255 - alphaThreshold)) * 255
      );
    }
    sourceContext.clearRect(0, 0, decoded.width, decoded.height);
    sourceContext.putImageData(sourcePixels, 0, 0);

    const productWidth = maxX - minX + 1;
    const productHeight = maxY - minY + 1;
    const contentSide = Math.round(maxSide * 0.8);
    const scale = Math.min(contentSide / productWidth, contentSide / productHeight);
    const outputWidth = Math.max(1, Math.round(productWidth * scale));
    const outputHeight = Math.max(1, Math.round(productHeight * scale));
    const outputX = Math.round((maxSide - outputWidth) / 2);
    const outputY = Math.round((maxSide - outputHeight) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = maxSide;
    canvas.height = maxSide;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить белый фон');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, maxSide, maxSide);
    context.drawImage(
      sourceCanvas,
      minX,
      minY,
      productWidth,
      productHeight,
      outputX,
      outputY,
      outputWidth,
      outputHeight
    );
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.96);
    return new File([blob], whiteBackgroundFileName(originalName), {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } finally {
    decoded.close();
    decodedOriginal?.close();
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
  const whiteImage = await placeCutoutOnWhite(transparentImage, file.name, MAX_PROCESSED_SIDE, preparedImage);
  report(100);
  return whiteImage;
};
