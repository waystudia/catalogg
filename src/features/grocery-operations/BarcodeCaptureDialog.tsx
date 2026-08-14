import { Camera, Keyboard, ScanBarcode, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { normalizeBarcode, useHardwareBarcodeScanner } from './barcodeScanner';
import {
  BARCODE_CAMERA_CONSTRAINTS,
  optimizeBarcodeCameraStream,
  preloadBrowserBarcodeDecoder,
  startBrowserBarcodeDecoder,
  type BrowserBarcodeDecoderControls
} from './browserBarcodeDecoder';
import { playBarcodeScanSound } from './barcodeScanFeedback';

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function BarcodeCaptureDialog({ open, autoStartCamera = false, title = 'Сканировать товар', onClose, onScan }: { open: boolean; autoStartCamera?: boolean; title?: string; onClose: () => void; onScan: (barcode: string) => void }) {
  const [value, setValue] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderControlsRef = useRef<BrowserBarcodeDecoderControls | null>(null);
  const animationRef = useRef<number | null>(null);
  const autoStartedRef = useRef(false);
  const cameraRequestRef = useRef(0);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    decoderControlsRef.current?.stop();
    decoderControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    setCameraStarting(false);
  }, []);

  const complete = useCallback(
    (rawBarcode: string) => {
      const barcode = normalizeBarcode(rawBarcode);
      if (!barcode) return false;
      playBarcodeScanSound();
      stopCamera();
      setValue('');
      onScan(barcode);
      return true;
    },
    [onScan, stopCamera]
  );

  useHardwareBarcodeScanner({
    enabled: open && !cameraActive,
    onScan: complete
  });

  const startCamera = useCallback(async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Камера недоступна в этом браузере. Используйте внешний сканер или введите код вручную.');
      return;
    }

    const requestId = cameraRequestRef.current + 1;
    cameraRequestRef.current = requestId;
    setCameraStarting(true);
    const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    const fallbackReady = Detector ? null : preloadBrowserBarcodeDecoder();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: BARCODE_CAMERA_CONSTRAINTS,
        audio: false
      });
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      void optimizeBarcodeCameraStream(stream);
      setCameraActive(true);
      const video = videoRef.current;
      if (!video) throw new Error('Видео недоступно');
      video.srcObject = stream;
      await video.play();
      setCameraStarting(false);
      if (!Detector) {
        await fallbackReady;
        const controls = await startBrowserBarcodeDecoder(video, complete);
        if (cameraRequestRef.current !== requestId) controls.stop();
        else decoderControlsRef.current = controls;
        return;
      }
      const detector = new Detector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code', 'data_matrix']
      });
      const scanFrame = async () => {
        try {
          const [match] = await detector.detect(video);
          if (match?.rawValue) {
            complete(match.rawValue);
            return;
          }
        } catch {
          // The next video frame may be ready even if the current one is not.
        }
        animationRef.current = requestAnimationFrame(() => void scanFrame());
      };
      animationRef.current = requestAnimationFrame(() => void scanFrame());
    } catch (error) {
      if (cameraRequestRef.current === requestId) {
        stopCamera();
        setCameraError(error instanceof Error ? error.message : 'Не удалось включить камеру');
      }
    }
  }, [complete, stopCamera]);

  useEffect(() => {
    if (!open) {
      autoStartedRef.current = false;
      stopCamera();
      setValue('');
      setCameraError('');
    }
    return stopCamera;
  }, [open, stopCamera]);

  useEffect(() => {
    if (!open || !autoStartCamera || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startCamera();
  }, [autoStartCamera, open, startCamera]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    complete(value);
  };

  if (!open) return null;

  return (
    <div
      className="grocery-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="grocery-dialog grocery-barcode-dialog" role="dialog" aria-modal="true" aria-labelledby="grocery-barcode-title">
        <header>
          <div>
            <ScanBarcode />
            <div>
              <h2 id="grocery-barcode-title">{title}</h2>
              <p>Наведите камеру или используйте USB/Bluetooth‑сканер</p>
            </div>
          </div>
          <button type="button" aria-label="Закрыть сканер" onClick={onClose}>
            <X />
          </button>
        </header>

        <div className="grocery-barcode-dialog__camera" data-active={cameraActive}>
          <video ref={videoRef} muted playsInline />
          {!cameraActive && !cameraStarting && <ScanBarcode aria-hidden="true" />}
          {cameraStarting && <span>Разрешите доступ к камере</span>}
          {cameraActive && (
            <>
              <i className="grocery-barcode-dialog__guide" aria-hidden="true" />
              <span>Быстрое сканирование · любой поворот</span>
            </>
          )}
        </div>

        {cameraError && <p className="grocery-form-error">{cameraError}</p>}

        <button className="grocery-button grocery-button--secondary" type="button" disabled={cameraStarting} onClick={() => (cameraActive ? stopCamera() : void startCamera())}>
          <Camera />
          {cameraStarting ? 'Включаем камеру…' : cameraActive ? 'Выключить камеру' : 'Включить камеру'}
        </button>

        <form onSubmit={submit}>
          <label>
            <span>
              <Keyboard />
              Штрих-код вручную
            </span>
            <input autoFocus={!autoStartCamera} inputMode="numeric" value={value} onChange={(event) => setValue(normalizeBarcode(event.target.value))} placeholder="4601234567890" />
          </label>
          <button className="grocery-button grocery-button--primary" type="submit" disabled={!value}>
            Найти товар
          </button>
        </form>
      </section>
    </div>
  );
}
