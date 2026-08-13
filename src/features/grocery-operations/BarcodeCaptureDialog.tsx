import { Camera, Keyboard, ScanBarcode, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { normalizeBarcode, useHardwareBarcodeScanner } from './barcodeScanner';

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function BarcodeCaptureDialog({
  open,
  title = 'Сканировать товар',
  onClose,
  onScan
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onScan: (barcode: string) => void;
}) {
  const [value, setValue] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const complete = useCallback((rawBarcode: string) => {
    const barcode = normalizeBarcode(rawBarcode);
    if (!barcode) return;
    stopCamera();
    setValue('');
    onScan(barcode);
  }, [onScan, stopCamera]);

  useHardwareBarcodeScanner({ enabled: open && !cameraActive, onScan: complete });

  useEffect(() => {
    if (!open) {
      stopCamera();
      setValue('');
      setCameraError('');
    }
    return stopCamera;
  }, [open, stopCamera]);

  const startCamera = async () => {
    setCameraError('');
    const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia || !Detector) {
      setCameraError('Камера не поддерживает распознавание штрих-кода. Используйте внешний сканер или введите код вручную.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);
      const video = videoRef.current;
      if (!video) throw new Error('Видео недоступно');
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code', 'data_matrix'] });
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
      stopCamera();
      setCameraError(error instanceof Error ? error.message : 'Не удалось включить камеру');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    complete(value);
  };

  if (!open) return null;

  return (
    <div className="grocery-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="grocery-dialog grocery-barcode-dialog" role="dialog" aria-modal="true" aria-labelledby="grocery-barcode-title">
        <header>
          <div>
            <ScanBarcode />
            <div>
              <h2 id="grocery-barcode-title">{title}</h2>
              <p>Наведите камеру или используйте USB/Bluetooth‑сканер</p>
            </div>
          </div>
          <button type="button" aria-label="Закрыть сканер" onClick={onClose}><X /></button>
        </header>

        <div className="grocery-barcode-dialog__camera" data-active={cameraActive}>
          <video ref={videoRef} muted playsInline />
          {!cameraActive && <ScanBarcode aria-hidden="true" />}
          {cameraActive && <span>Поместите штрих-код в рамку</span>}
        </div>

        {cameraError && <p className="grocery-form-error">{cameraError}</p>}

        <button className="grocery-button grocery-button--secondary" type="button" onClick={() => cameraActive ? stopCamera() : void startCamera()}>
          <Camera />
          {cameraActive ? 'Выключить камеру' : 'Включить камеру'}
        </button>

        <form onSubmit={submit}>
          <label>
            <span><Keyboard />Штрих-код вручную</span>
            <input
              autoFocus
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(normalizeBarcode(event.target.value))}
              placeholder="4601234567890"
            />
          </label>
          <button className="grocery-button grocery-button--primary" type="submit" disabled={!value}>Найти товар</button>
        </form>
      </section>
    </div>
  );
}
