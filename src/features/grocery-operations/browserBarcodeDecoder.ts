export type BrowserBarcodeDecoderControls = {
  stop: () => void;
};

export const BARCODE_CAMERA_CONSTRAINTS = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 30 }
} satisfies MediaTrackConstraints;

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

export async function createBrowserBarcodeReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library')
  ]);
  const hints = new Map<import('@zxing/library').DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX
  ]);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 45,
    delayBetweenScanSuccess: 120
  });
}

type CanvasBarcodeReader = Awaited<ReturnType<typeof createBrowserBarcodeReader>>;

function drawQuarterTurn(source: HTMLCanvasElement, target: HTMLCanvasElement) {
  if (target.width !== source.height) target.width = source.height;
  if (target.height !== source.width) target.height = source.width;
  const context = target.getContext('2d', { alpha: false });
  if (!context) return false;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, target.width, target.height);
  context.translate(target.width / 2, target.height / 2);
  context.rotate(Math.PI / 2);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return true;
}

export function decodeBarcodeCanvasAcrossOrientations(
  reader: CanvasBarcodeReader,
  source: HTMLCanvasElement,
  quarterTurnCanvas = document.createElement('canvas')
) {
  try {
    return reader.decodeFromCanvas(source).getText().trim();
  } catch {
    // An explicit 90° pass avoids ZXing's slower TRY_HARDER search and also covers
    // 270°; ZXing scans every 1D row in both directions.
  }

  if (!drawQuarterTurn(source, quarterTurnCanvas)) return '';
  try {
    return reader.decodeFromCanvas(quarterTurnCanvas).getText().trim();
  } catch {
    return '';
  }
}

export async function startBrowserBarcodeDecoder(
  video: HTMLVideoElement,
  onDetected: (barcode: string) => boolean
): Promise<BrowserBarcodeDecoderControls> {
  const reader = await createBrowserBarcodeReader();

  // Test doubles and older compatible readers retain their native continuous loop.
  if (typeof reader.decodeFromCanvas !== 'function') {
    return reader.decodeFromVideoElement(video, (result, _error, controls) => {
      const barcode = result?.getText().trim();
      if (barcode && onDetected(barcode)) controls.stop();
    });
  }

  let stopped = false;
  let timer = 0;
  const frameCanvas = document.createElement('canvas');
  const quarterTurnCanvas = document.createElement('canvas');
  const controls: BrowserBarcodeDecoderControls = {
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
    }
  };

  const scan = () => {
    if (stopped) return;
    try {
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (sourceWidth > 0 && sourceHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
        const frameWidth = Math.max(1, Math.round(sourceWidth * scale));
        const frameHeight = Math.max(1, Math.round(sourceHeight * scale));
        if (frameCanvas.width !== frameWidth) frameCanvas.width = frameWidth;
        if (frameCanvas.height !== frameHeight) frameCanvas.height = frameHeight;
        const context = frameCanvas.getContext('2d', { alpha: false });
        if (context) {
          context.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
          const barcode = decodeBarcodeCanvasAcrossOrientations(reader, frameCanvas, quarterTurnCanvas);
          if (barcode && onDetected(barcode)) {
            controls.stop();
            return;
          }
        }
      }
    } catch {
      // Camera frames can be transiently unavailable while Safari changes focus.
    }
    timer = window.setTimeout(scan, 45);
  };

  // The complete video frame is drawn; the square in the UI is only a guide.
  scan();
  return controls;
}
