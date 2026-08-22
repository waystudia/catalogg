import { ArrowRight, Camera, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidGlobalBarcode } from '../../entities/sharedProducts';
import {
  BARCODE_CAMERA_CONSTRAINTS,
  optimizeBarcodeCameraStream,
  preloadBrowserBarcodeDecoder,
  startBrowserBarcodeDecoder,
  type BrowserBarcodeDecoderControls
} from '../grocery-operations/browserBarcodeDecoder';
import { playBarcodeScanSound } from '../grocery-operations/barcodeScanFeedback';

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

export function SharedBarcodeScanner({
  onDetected,
  onClose,
  onNext
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  onNext?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [message, setMessage] = useState('Разрешите доступ к камере');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    let fallbackControls: BrowserBarcodeDecoderControls | null = null;

    const start = async () => {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      const fallbackReady = Detector ? null : preloadBrowserBarcodeDecoder();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: BARCODE_CAMERA_CONSTRAINTS,
          audio: false
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        void optimizeBarcodeCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setMessage('Камера готова');

        if (!Detector && videoRef.current) {
          await fallbackReady;
          fallbackControls = await startBrowserBarcodeDecoder(videoRef.current, (rawBarcode) => {
            const barcode = rawBarcode.trim();
            if (!isValidGlobalBarcode(barcode)) return false;
            playBarcodeScanSound();
            stopCamera();
            onDetected(barcode);
            return true;
          });
          if (disposed) fallbackControls.stop();
          return;
        }

        const detector = new Detector!({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128', 'qr_code']
        });
        const tick = async () => {
          if (disposed || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes.map((code) => code.rawValue.trim()).find(isValidGlobalBarcode);
            if (value) {
              playBarcodeScanSound();
              stopCamera();
              onDetected(value);
              return;
            }
          } catch {
            // A transient frame decode error is expected while the camera focuses.
          }
          timer = window.setTimeout(tick, 60);
        };
        void tick();
      } catch {
        setMessage('Камера недоступна. Разрешите доступ или введите штрих‑код вручную.');
      }
    };

    void start();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      fallbackControls?.stop();
      stopCamera();
    };
  }, [onDetected, restartKey, stopCamera]);

  return (
    <div className="shared-catalog-scanner" role="dialog" aria-modal="true" aria-label="Сканер штрих-кода">
      <div className="shared-catalog-scanner__panel">
        <header className="shared-catalog-scanner__head">
          <span>
            <strong>{onNext ? 'Добавление товара' : 'Сканер штрих-кода'}</strong>
            {onNext && <small>Шаг 1 из 2</small>}
          </span>
          <button type="button" className="shared-catalog-scanner__close" onClick={onClose} aria-label="Закрыть"><X /></button>
        </header>
        {onNext && (
          <div className="shared-catalog-camera-steps" aria-label="Этапы добавления товара">
            <strong className="is-active"><span>1</span>Штрих‑код</strong>
            <i aria-hidden="true" />
            <strong><span>2</span>Фото</strong>
          </div>
        )}
        <div className="shared-catalog-scanner__camera">
          <video ref={videoRef} playsInline muted />
          <span><Camera />Наведите на штрих-код</span>
        </div>
        <strong className="shared-catalog-scanner__status">{message}</strong>
        <small>{onNext ? 'После сканирования сразу откроется камера товара' : 'EAN‑8, EAN‑13, UPC и QR с GTIN'}</small>
        <div className="shared-catalog-scanner__actions">
          <button type="button" onClick={() => setRestartKey((value) => value + 1)}><RotateCcw />Повторить</button>
          {onNext && <button type="button" onClick={onNext}>Далее: фото<ArrowRight /></button>}
        </div>
      </div>
    </div>
  );
}
