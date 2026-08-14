import { Camera, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidGlobalBarcode } from '../../entities/sharedProducts';
import {
  BARCODE_CAMERA_CONSTRAINTS,
  optimizeBarcodeCameraStream,
  startBrowserBarcodeDecoder,
  type BrowserBarcodeDecoderControls
} from '../grocery-operations/browserBarcodeDecoder';

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

export function SharedBarcodeScanner({
  onDetected,
  onClose
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
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
        setMessage('Сканируем весь кадр — поворачивать телефон не нужно');

        if (!Detector && videoRef.current) {
          fallbackControls = await startBrowserBarcodeDecoder(videoRef.current, (rawBarcode) => {
            const barcode = rawBarcode.trim();
            if (!isValidGlobalBarcode(barcode)) return false;
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
        <button type="button" className="shared-catalog-scanner__close" onClick={onClose} aria-label="Закрыть"><X /></button>
        <div className="shared-catalog-scanner__camera">
          <video ref={videoRef} playsInline muted />
          <span><Camera />Весь кадр</span>
        </div>
        <strong>{message}</strong>
        <small>Поддерживаются EAN‑8, EAN‑13, UPC и QR с записанным внутри GTIN.</small>
        <button type="button" onClick={() => setRestartKey((value) => value + 1)}><RotateCcw />Повторить</button>
      </div>
    </div>
  );
}
