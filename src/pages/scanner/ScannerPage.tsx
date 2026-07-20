import { CheckCircle2, QrCode, RotateCcw, XCircle } from 'lucide-react';
import jsQR from 'jsqr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { confirmDeliveryPickupQr } from '../../shared/api/deliveryApi';
import './scanner.css';

type ParsedQr =
  | { kind: 'restaurant'; slug: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'delivery'; orderId?: string; deliveryId?: string; token?: string }
  | { kind: 'payment'; orderId?: string }
  | { kind: 'unknown'; raw: string };

function parseQr(raw: string): ParsedQr {
  const text = raw.trim();
  if (text.startsWith('wc-delivery|')) {
    const [, deliveryId, ...tokenParts] = text.split('|');
    const token = tokenParts.join('|');
    if (deliveryId && token) return { kind: 'delivery', deliveryId, token };
  }

  try {
    const parsed = JSON.parse(text) as { type?: string; orderId?: string; deliveryId?: string; token?: string };
    if (parsed.type === 'order' && parsed.orderId) return { kind: 'order', orderId: parsed.orderId };
    if (parsed.type === 'delivery' && (parsed.orderId || parsed.deliveryId)) {
      return {
        kind: 'delivery',
        orderId: parsed.orderId,
        deliveryId: parsed.deliveryId,
        token: parsed.token
      };
    }
    if (parsed.type === 'payment') return { kind: 'payment', orderId: parsed.orderId };
  } catch {
    // Plain links are handled below.
  }

  const match = text.match(/(?:#\/|\/)([a-z0-9-]+)(?:\/|$)/i);
  if (match?.[1] && !['admin', 'login', 'scanner', 'register'].includes(match[1])) {
    return { kind: 'restaurant', slug: match[1] };
  }

  return { kind: 'unknown', raw: text };
}

function scanVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement | null) {
  if (!canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
    return '';
  }

  const maxScanSize = 720;
  const scale = Math.min(1, maxScanSize / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })?.data ?? '';
}

export function ScannerPage() {
  const navigate = useNavigate();
  const { slug = '' } = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handledQrRef = useRef(false);
  const [scannerKey, setScannerKey] = useState(0);
  const [message, setMessage] = useState('Наведите камеру на QR-код выдачи');
  const [scanState, setScanState] = useState<'idle' | 'searching' | 'success' | 'error'>('idle');
  const [isCameraActive, setIsCameraActive] = useState(false);

  const scannerTitle = useMemo(() => (slug ? `Сканер ${slug}` : 'Сканер QR'), [slug]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraActive(false);
  };

  const handleParsed = useCallback(async (parsed: ParsedQr) => {
    if (parsed.kind === 'restaurant') {
      navigate(`/${parsed.slug}`);
      return;
    }
    if (parsed.kind === 'order') {
      navigate(`/${slug || 'mangal'}/dashboard?order=${encodeURIComponent(parsed.orderId)}`);
      return;
    }
    if (parsed.kind === 'delivery') {
      if (parsed.deliveryId && parsed.token) {
        setScanState('searching');
        setMessage('Проверяю QR');
        try {
          const confirmed = await confirmDeliveryPickupQr(parsed.deliveryId, parsed.token);
          setScanState(confirmed ? 'success' : 'error');
          setMessage(confirmed ? 'Передан водителю' : 'QR не подходит');
          if (confirmed) {
            window.localStorage.setItem('waycatalog-driver-delivery-confirmed', `${parsed.deliveryId}:${Date.now()}`);
          }
        } catch (error) {
          setScanState('error');
          setMessage(error instanceof Error ? error.message : 'Не удалось подтвердить выдачу.');
        }
        return;
      }
      if (!parsed.orderId) {
        setScanState('error');
        setMessage('Неправильный QR-код выдачи');
        return;
      }
      navigate(`/${slug || 'mangal'}/dashboard?delivery=${encodeURIComponent(parsed.orderId)}`);
      return;
    }
    if (parsed.kind === 'payment') {
      navigate(`/${slug || 'mangal'}/payments`);
      return;
    }
    setScanState('error');
    setMessage('Неправильный QR-код');
  }, [navigate, slug]);

  const retryScan = () => {
    handledQrRef.current = false;
    setScanState('idle');
    setMessage('Наведите камеру на QR-код выдачи');
    setScannerKey((current) => current + 1);
  };

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    handledQrRef.current = false;

    const start = async () => {
      const detectorConstructor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setIsCameraActive(true);
        setScanState('searching');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setMessage('Ищу QR-код выдачи');

        const detector = detectorConstructor ? new detectorConstructor({ formats: ['qr_code'] }) : null;
        const tick = async () => {
          if (disposed || handledQrRef.current || !videoRef.current) return;
          try {
            const nativeCodes = detector ? await detector.detect(videoRef.current) : [];
            const nativeValue = nativeCodes[0]?.rawValue;
            const fallbackValue = nativeValue ? '' : scanVideoFrame(videoRef.current, canvasRef.current);
            const value = nativeValue || fallbackValue;
            if (value) {
              handledQrRef.current = true;
              stopCamera();
              void handleParsed(parseQr(value));
              return;
            }
          } catch (error) {
            const fallbackValue = scanVideoFrame(videoRef.current, canvasRef.current);
            if (fallbackValue) {
              handledQrRef.current = true;
              stopCamera();
              void handleParsed(parseQr(fallbackValue));
              return;
            }
            if (error instanceof Error && error.name === 'NotAllowedError') {
              setScanState('error');
              setMessage('Камера недоступна. Разрешите доступ и повторите.');
            }
          }
          raf = window.setTimeout(tick, 220);
        };
        void tick();
      } catch {
        setScanState('error');
        setMessage('Не удалось открыть камеру');
      }
    };

    void start();

    return () => {
      disposed = true;
      window.clearTimeout(raf);
      stopCamera();
    };
  }, [handleParsed, scannerKey]);

  return (
    <main className="scanner-page">
      <section className={`scanner-camera scanner-camera--${scanState}`}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="scanner-frame">
          <QrCode />
          <span>{scannerTitle}</span>
        </div>
      </section>

      <section className="scanner-controls">
        <div className={`scanner-result scanner-result--${scanState}`}>
          {scanState === 'success' ? <CheckCircle2 /> : scanState === 'error' ? <XCircle /> : <QrCode />}
          <p>{message}</p>
          <small>
            {scanState === 'success'
              ? 'Выдача подтверждена. Заказ передан водителю.'
              : scanState === 'error'
                ? 'Проверьте, что это QR именно этого заказа, и попробуйте ещё раз.'
                : isCameraActive
                  ? 'Держите QR-код ровно в рамке.'
                  : 'Подготавливаю камеру.'}
          </small>
        </div>
        <button className="scanner-submit" type="button" onClick={retryScan}>
          <RotateCcw />
          Повторить сканирование
        </button>
      </section>
    </main>
  );
}
