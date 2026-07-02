import { Camera, Flashlight, QrCode, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './scanner.css';

type ParsedQr =
  | { kind: 'restaurant'; slug: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'delivery'; orderId: string }
  | { kind: 'payment'; orderId?: string }
  | { kind: 'unknown'; raw: string };

function parseQr(raw: string): ParsedQr {
  const text = raw.trim();
  try {
    const parsed = JSON.parse(text) as { type?: string; orderId?: string };
    if (parsed.type === 'order' && parsed.orderId) return { kind: 'order', orderId: parsed.orderId };
    if (parsed.type === 'delivery' && parsed.orderId) return { kind: 'delivery', orderId: parsed.orderId };
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

export function ScannerPage() {
  const navigate = useNavigate();
  const { slug = '' } = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [rawValue, setRawValue] = useState('');
  const [message, setMessage] = useState('Наведите камеру на QR-код');
  const [cameraMode, setCameraMode] = useState<'environment' | 'user'>('environment');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isDetectorAvailable, setIsDetectorAvailable] = useState(false);

  const scannerTitle = useMemo(() => (slug ? `Сканер ${slug}` : 'Сканер QR'), [slug]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraActive(false);
  };

  const handleParsed = useCallback((parsed: ParsedQr) => {
    if (parsed.kind === 'restaurant') {
      navigate(`/${parsed.slug}`);
      return;
    }
    if (parsed.kind === 'order') {
      navigate(`/${slug || 'mangal'}/dashboard?order=${encodeURIComponent(parsed.orderId)}`);
      return;
    }
    if (parsed.kind === 'delivery') {
      navigate(`/${slug || 'mangal'}/dashboard?delivery=${encodeURIComponent(parsed.orderId)}`);
      return;
    }
    if (parsed.kind === 'payment') {
      navigate(`/${slug || 'mangal'}/payments`);
      return;
    }
    setMessage('QR не распознан. Проверьте формат или вставьте ссылку каталога.');
  }, [navigate, slug]);

  const scanManual = () => {
    handleParsed(parseQr(rawValue));
  };

  useEffect(() => {
    let disposed = false;
    let raf = 0;

    const start = async () => {
      const detectorConstructor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      setIsDetectorAvailable(Boolean(detectorConstructor));
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraMode },
          audio: false
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setIsCameraActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!detectorConstructor || !videoRef.current) return;
        const detector = new detectorConstructor({ formats: ['qr_code'] });
        const tick = async () => {
          if (disposed || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue;
            if (value) {
              stopCamera();
              handleParsed(parseQr(value));
              return;
            }
          } catch {
            setMessage('Камера работает, но браузер не дал распознать QR автоматически.');
          }
          raf = window.setTimeout(tick, 450);
        };
        void tick();
      } catch {
        setMessage('Не удалось открыть камеру. Разрешите доступ или вставьте QR-текст вручную.');
      }
    };

    void start();

    return () => {
      disposed = true;
      window.clearTimeout(raf);
      stopCamera();
    };
  }, [cameraMode, handleParsed]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchEnabled } as MediaTrackConstraintSet] });
      setTorchEnabled((current) => !current);
    } catch {
      setMessage('Фонарик недоступен на этом устройстве.');
    }
  };

  return (
    <main className="scanner-page">
      <section className="scanner-camera">
        <video ref={videoRef} playsInline muted />
        <div className="scanner-frame">
          <QrCode />
          <span>{scannerTitle}</span>
        </div>
      </section>

      <section className="scanner-controls">
        <p>{message}</p>
        {!isDetectorAvailable && <small>Автораспознавание QR может быть недоступно в этом браузере.</small>}
        <div>
          <button type="button" onClick={toggleTorch} disabled={!isCameraActive}>
            <Flashlight />
            Фонарик
          </button>
          <button type="button" onClick={() => setCameraMode((current) => (current === 'environment' ? 'user' : 'environment'))}>
            <RotateCcw />
            Камера
          </button>
          <button type="button" onClick={() => navigate(slug ? `/${slug}/dashboard` : '/')}>
            <Camera />
            Закрыть
          </button>
        </div>
        <label>
          QR-текст или ссылка
          <textarea value={rawValue} onChange={(event) => setRawValue(event.target.value)} placeholder='{"type":"order","orderId":"12345"}' />
        </label>
        <button className="scanner-submit" type="button" onClick={scanManual}>Обработать QR</button>
      </section>
    </main>
  );
}
