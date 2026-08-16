import { Camera, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isValidGlobalBarcode } from "../../entities/sharedProducts";
import {
  BARCODE_CAMERA_CONSTRAINTS,
  optimizeBarcodeCameraStream,
  preloadBrowserBarcodeDecoder,
  startBrowserBarcodeDecoder,
  type BrowserBarcodeDecoderControls,
} from "../grocery-operations/browserBarcodeDecoder";
import { playBarcodeScanSound } from "../grocery-operations/barcodeScanFeedback";

type CameraState = "starting" | "scanning" | "detected" | "error";

const cameraErrorMessage = (error: unknown) => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError")
      return "Доступ к камере запрещён. Разрешите камеру для wayyaam.ru в настройках браузера и повторите.";
    if (error.name === "NotFoundError")
      return "Камера не найдена на этом устройстве.";
    if (error.name === "NotReadableError")
      return "Камера занята другим приложением. Закройте его и повторите.";
  }
  return "Не удалось включить камеру. Проверьте разрешение браузера и повторите.";
};

export function PlatformBarcodeCameraScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<BrowserBarcodeDecoderControls | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const onDetectedRef = useRef(onDetected);
  const lastBarcodeRef = useRef("");
  const disposedRef = useRef(false);
  const [restartKey, setRestartKey] = useState(0);
  const [state, setState] = useState<CameraState>("starting");
  const [message, setMessage] = useState("Разрешите доступ к камере");
  const [scannedCount, setScannedCount] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stopCamera = useCallback(() => {
    decoderRef.current?.stop();
    decoderRef.current = null;
    if (restartTimerRef.current !== null)
      window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    let requestActive = true;

    const start = async () => {
      setState("starting");
      setMessage("Разрешите доступ к камере");
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("error");
        setMessage(
          "Этот браузер не даёт доступ к камере. Используйте Safari или Chrome либо внешний сканер.",
        );
        return;
      }

      try {
        const decoderReady = preloadBrowserBarcodeDecoder();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: BARCODE_CAMERA_CONSTRAINTS,
          audio: false,
        });
        if (!requestActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        void optimizeBarcodeCameraStream(stream);
        const video = videoRef.current;
        if (!video) throw new Error("Видео недоступно");
        video.srcObject = stream;
        await video.play();
        await decoderReady;
        setState("scanning");
        setMessage("Наведите камеру на штрих-код товара");

        const startDecodeCycle = async () => {
          if (disposedRef.current || !videoRef.current) return;
          const controls = await startBrowserBarcodeDecoder(
            videoRef.current,
            (rawBarcode) => {
              const barcode = rawBarcode.trim();
              if (!isValidGlobalBarcode(barcode)) return false;
              if (lastBarcodeRef.current === barcode) return false;
              lastBarcodeRef.current = barcode;
              setState("detected");
              setMessage(`Распознан ${barcode}. Покажите следующий товар.`);
              setScannedCount((count) => count + 1);
              playBarcodeScanSound();
              void Promise.resolve(onDetectedRef.current(barcode))
                .catch(() => undefined)
                .finally(() => {
                  if (disposedRef.current) return;
                  restartTimerRef.current = window.setTimeout(() => {
                    if (disposedRef.current) return;
                    setState("scanning");
                    setMessage("Наведите камеру на следующий штрих-код");
                    void startDecodeCycle();
                  }, 700);
                });
              return true;
            },
          );
          if (disposedRef.current) controls.stop();
          else decoderRef.current = controls;
        };

        await startDecodeCycle();
      } catch (error) {
        if (!requestActive) return;
        stopCamera();
        setState("error");
        setMessage(cameraErrorMessage(error));
      }
    };

    void start();
    return () => {
      requestActive = false;
      disposedRef.current = true;
      stopCamera();
    };
  }, [restartKey, stopCamera]);

  return (
    <div className="platform-camera-backdrop" role="presentation">
      <section
        className="platform-camera-scanner"
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-camera-title"
      >
        <header>
          <div>
            <Camera />
            <div>
              <h2 id="platform-camera-title">Сканирование камерой</h2>
              <p>EAN‑8, EAN‑13, UPC и другие товарные коды</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть камеру">
            <X />
          </button>
        </header>

        <div className={`platform-camera-preview is-${state}`}>
          <video ref={videoRef} playsInline muted />
          <span className="platform-camera-guide" aria-hidden="true" />
          {state === "starting" && <strong>Включаем камеру…</strong>}
        </div>

        <div className={`platform-camera-status is-${state}`} role="status">
          <span />
          <div>
            <strong>{message}</strong>
            <small>
              {scannedCount > 0
                ? `За этот запуск распознано: ${scannedCount}`
                : "Камера запускается только после нажатия кнопки."}
            </small>
          </div>
        </div>

        <footer>
          {state === "error" && (
            <button
              type="button"
              onClick={() => setRestartKey((value) => value + 1)}
            >
              <RotateCcw />
              Повторить
            </button>
          )}
          <button type="button" className="barcode-primary" onClick={onClose}>
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
