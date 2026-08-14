import type { ReaderOptions } from 'zxing-wasm/reader';
import readerWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export type BrowserBarcodeDecoderControls = {
  stop: () => void;
};

export const BARCODE_CAMERA_CONSTRAINTS = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 }
} satisfies MediaTrackConstraints;

export const FAST_BARCODE_READER_OPTIONS: ReaderOptions = {
  formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'Code128', 'QRCode', 'DataMatrix'],
  tryHarder: false,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: false,
  maxNumberOfSymbols: 1,
  minLineCount: 1,
  textMode: 'Plain'
};

type BarcodeCameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
};

export async function optimizeBarcodeCameraStream(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities || !track.applyConstraints) return;

  try {
    const capabilities = track.getCapabilities() as BarcodeCameraCapabilities;
    if (!capabilities.focusMode?.includes('continuous')) return;
    await track.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
    });
  } catch {
    // Continuous autofocus is an optional optimization and must not block scanning.
  }
}

type FastBarcodeDecoderModule = typeof import('zxing-wasm/reader');
let decoderPromise: Promise<FastBarcodeDecoderModule> | null = null;

const locateReaderWasm = (path: string, prefix: string) =>
  path.endsWith('.wasm') ? readerWasmUrl : `${prefix}${path}`;

export function preloadBrowserBarcodeDecoder() {
  decoderPromise ??= import('zxing-wasm/reader').then(async (decoder) => {
    await decoder.prepareZXingModule({
      overrides: { locateFile: locateReaderWasm },
      fireImmediately: true
    });
    return decoder;
  });
  return decoderPromise;
}

export async function decodeBarcodeImageData(image: ImageData) {
  const decoder = await preloadBrowserBarcodeDecoder();
  const results = await decoder.readBarcodes(image, FAST_BARCODE_READER_OPTIONS);
  return results.find((result) => !result.error && result.text.trim())?.text.trim() ?? '';
}

export type BarcodeScanFrame = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
};

export function planBarcodeScanFrame(sourceWidth: number, sourceHeight: number, attempt: number): BarcodeScanFrame {
  if (attempt % 2 === 0) {
    const sourceSize = Math.min(sourceWidth, sourceHeight);
    return {
      sourceX: Math.round((sourceWidth - sourceSize) / 2),
      sourceY: Math.round((sourceHeight - sourceSize) / 2),
      sourceWidth: sourceSize,
      sourceHeight: sourceSize,
      targetWidth: 720,
      targetHeight: 720
    };
  }

  const scale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
  return {
    sourceX: 0,
    sourceY: 0,
    sourceWidth,
    sourceHeight,
    targetWidth: Math.max(1, Math.round(sourceWidth * scale)),
    targetHeight: Math.max(1, Math.round(sourceHeight * scale))
  };
}

export async function startBrowserBarcodeDecoder(
  video: HTMLVideoElement,
  onDetected: (barcode: string) => boolean
): Promise<BrowserBarcodeDecoderControls> {
  let stopped = false;
  let frameRequest = 0;
  let attempt = 0;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const controls: BrowserBarcodeDecoderControls = {
    stop: () => {
      stopped = true;
      window.cancelAnimationFrame(frameRequest);
    }
  };

  const scheduleNextFrame = () => {
    if (!stopped) frameRequest = window.requestAnimationFrame(() => void scan());
  };

  const scan = async () => {
    if (stopped) return;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!context || sourceWidth <= 0 || sourceHeight <= 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      scheduleNextFrame();
      return;
    }

    try {
      const frame = planBarcodeScanFrame(sourceWidth, sourceHeight, attempt++);
      if (canvas.width !== frame.targetWidth) canvas.width = frame.targetWidth;
      if (canvas.height !== frame.targetHeight) canvas.height = frame.targetHeight;
      context.drawImage(
        video,
        frame.sourceX,
        frame.sourceY,
        frame.sourceWidth,
        frame.sourceHeight,
        0,
        0,
        frame.targetWidth,
        frame.targetHeight
      );
      const image = context.getImageData(0, 0, frame.targetWidth, frame.targetHeight);
      const barcode = await decodeBarcodeImageData(image);
      if (barcode && onDetected(barcode)) {
        controls.stop();
        return;
      }
    } catch {
      // A frame can be unavailable while Safari switches lenses or adjusts focus.
    }
    scheduleNextFrame();
  };

  void preloadBrowserBarcodeDecoder().then(scheduleNextFrame, scheduleNextFrame);
  return controls;
}
