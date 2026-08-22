import { Camera, ImagePlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { releaseCameraStream } from './releaseCameraStream';

type CameraStreamFactory = () => Promise<MediaStream>;

const defaultCameraStreamFactory: CameraStreamFactory = () => navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1920 }
  },
  audio: false
});

const canvasToJpeg = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Не удалось подготовить снимок'));
  }, 'image/jpeg', 0.96);
});

export function ProductPhotoCamera({
  onCapture,
  onChooseFile,
  onClose,
  wizard = false,
  cameraStreamFactory = defaultCameraStreamFactory
}: {
  onCapture: (file: File) => void | Promise<void>;
  onChooseFile?: () => void;
  onClose: () => void;
  wizard?: boolean;
  cameraStreamFactory?: CameraStreamFactory;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    releaseCameraStream(activeVideoRef.current ?? videoRef.current, streamRef.current);
    activeVideoRef.current = null;
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let disposed = false;
    const start = async () => {
      try {
        const stream = await cameraStreamFactory();
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          activeVideoRef.current = videoRef.current;
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        setError('Камера недоступна. Разрешите доступ или выберите фото из галереи.');
      }
    };
    void start();
    return () => {
      disposed = true;
      stopCamera();
    };
  }, [cameraStreamFactory, stopCamera]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) {
      setError('Камера ещё готовится. Подождите секунду и повторите снимок.');
      return;
    }
    setCapturing(true);
    setError('');
    try {
      const sourceSide = Math.min(video.videoWidth, video.videoHeight);
      const sourceX = Math.round((video.videoWidth - sourceSide) / 2);
      const sourceY = Math.round((video.videoHeight - sourceSide) / 2);
      const outputSide = Math.min(1600, sourceSide);
      const canvas = document.createElement('canvas');
      canvas.width = outputSide;
      canvas.height = outputSide;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не удалось открыть камеру');
      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceSide,
        sourceSide,
        0,
        0,
        outputSide,
        outputSide
      );
      const blob = await canvasToJpeg(canvas);
      const file = new File([blob], `product-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
      stopCamera();
      await onCapture(file);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Не удалось сделать снимок');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="product-photo-camera" role="dialog" aria-modal="true" aria-label="Фотографирование товара">
      <section className={`product-photo-camera__panel${wizard ? ' product-photo-camera__panel--wizard' : ''}`}>
        <header>
          <span><Camera /><span><strong>{wizard ? 'Добавление товара' : 'Фото товара'}</strong>{wizard && <small>Шаг 2 из 2</small>}</span></span>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X /></button>
        </header>
        {wizard && (
          <div className="shared-catalog-camera-steps shared-catalog-camera-steps--dark" aria-label="Этапы добавления товара">
            <strong className="is-complete"><span>✓</span>Штрих‑код</strong>
            <i aria-hidden="true" />
            <strong className="is-active"><span>2</span>Фото</strong>
          </div>
        )}
        {ready && <p className="product-photo-camera__ready"><span aria-hidden="true">✓</span>Камера готова</p>}
        <div className="product-photo-camera__viewfinder">
          <video ref={videoRef} playsInline muted />
          <div className="product-photo-camera__shade" aria-hidden="true" />
          <div className="product-photo-camera__guide" role="img" aria-label="Квадратная рамка товара">
            <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
            <span className="product-photo-camera__guide-vertical" aria-hidden="true" />
            <span className="product-photo-camera__guide-horizontal" aria-hidden="true" />
          </div>
          {!ready && !error && <p>Запускаем камеру…</p>}
        </div>
        <div className="product-photo-camera__instructions">
          <strong>Поместите весь товар в рамку</strong>
          <small>Не обрезайте крышку и края. Держите телефон неподвижно.</small>
        </div>
        {error && <p className="product-photo-camera__error" role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onChooseFile}><ImagePlus />Выбрать из галереи</button>
          <button type="button" className="product-photo-camera__shutter" disabled={!ready || capturing} onClick={() => void capture()} aria-label="Сделать снимок"><span /></button>
          <button type="button" onClick={onClose}><X />Закрыть</button>
        </footer>
      </section>
    </div>
  );
}
